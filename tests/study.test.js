import request from 'supertest';
import app from '../server.js';
import Card from '../models/Card.js';
import { setup, teardown, clearDB } from './setup.js';

// Push a card's dueDate into the past so it reads as overdue.
const makeOverdue = (cardId) =>
  Card.updateOne({ _id: cardId }, { $set: { dueDate: new Date(Date.now() - 86400000) } });

beforeAll(setup);
afterAll(teardown);
afterEach(clearDB);

async function bootstrap() {
  const cookie = (
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@example.com', password: 'password123' })
  ).headers['set-cookie'];

  const deck = await request(app)
    .post('/api/decks')
    .set('Cookie', cookie)
    .send({ name: 'Test', sourceLang: 'en', targetLang: 'es' });

  const card = await request(app)
    .post(`/api/decks/${deck.body._id}/cards`)
    .set('Cookie', cookie)
    .send({ front: 'hello', back: 'hola' });

  return { cookie, deckId: deck.body._id, cardId: card.body._id };
}

describe('GET /api/study/:deckId', () => {
  it('returns new cards for a fresh deck', async () => {
    const { cookie, deckId } = await bootstrap();
    const res = await request(app).get(`/api/study/${deckId}`).set('Cookie', cookie).expect(200);
    expect(res.body.new).toHaveLength(1);
    expect(res.body.due).toHaveLength(0);
  });

  it('returns 404 for unknown deck', async () => {
    const { cookie } = await bootstrap();
    await request(app).get('/api/study/000000000000000000000000').set('Cookie', cookie).expect(404);
  });

  // Regression: SM-2 resets repetitions to 0 on "again". When the due query
  // filtered on repetitions > 0, a lapsed card matched neither due nor new
  // and disappeared from study permanently.
  it('returns a lapsed ("again") card once it is overdue', async () => {
    const { cookie, deckId, cardId } = await bootstrap();

    await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'again' })
      .expect(200);

    await makeOverdue(cardId);

    const res = await request(app).get(`/api/study/${deckId}`).set('Cookie', cookie).expect(200);
    expect(res.body.due.map((c) => c._id)).toEqual([cardId]);
    // and it must not be double-served as a new card
    expect(res.body.new).toHaveLength(0);
  });

  it('does not return a lapsed card before it is due again', async () => {
    const { cookie, deckId, cardId } = await bootstrap();

    await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'again' });

    const res = await request(app).get(`/api/study/${deckId}`).set('Cookie', cookie).expect(200);
    expect(res.body.due).toHaveLength(0);
    expect(res.body.new).toHaveLength(0);
  });
});

describe('POST /api/study/:cardId/review', () => {
  it('grades a card with good and reschedules it', async () => {
    const { cookie, cardId } = await bootstrap();
    const res = await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'good' })
      .expect(200);

    expect(res.body.repetitions).toBe(1);
    expect(res.body.interval).toBe(1);
    expect(new Date(res.body.dueDate).getTime()).toBeGreaterThan(Date.now());
  });

  it('grades a card with again and resets it', async () => {
    const { cookie, cardId } = await bootstrap();
    // First grade to advance
    await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'good' });

    // Then fail
    const res = await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'again' })
      .expect(200);

    expect(res.body.repetitions).toBe(0);
    expect(res.body.interval).toBe(1);
  });

  it('rejects invalid grade', async () => {
    const { cookie, cardId } = await bootstrap();
    await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'perfect' })
      .expect(400);
  });

  it('returns 401 without auth', async () => {
    const { cardId } = await bootstrap();
    await request(app).post(`/api/study/${cardId}/review`).send({ grade: 'good' }).expect(401);
  });
});
