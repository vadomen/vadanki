import request from 'supertest';
import app from '../server.js';
import { setup, teardown, clearDB } from './setup.js';

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
