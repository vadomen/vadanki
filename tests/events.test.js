import request from 'supertest';
import app from '../server.js';
import Event from '../models/Event.js';
import { EVENTS_MAX_BYTES } from '../models/Event.js';
import { setup, teardown, clearDB } from './setup.js';

beforeAll(setup);
afterAll(teardown);
afterEach(clearDB);

// logEvent is fire-and-forget, so poll briefly for the write to land.
async function waitForEvents(filter, count = 1) {
  for (let i = 0; i < 50; i++) {
    const events = await Event.find(filter).sort({ $natural: 1 }).lean();
    if (events.length >= count) return events;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for ${count} event(s) matching ${JSON.stringify(filter)}`);
}

async function bootstrap() {
  const cookie = (
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'events@example.com', password: 'password123' })
  ).headers['set-cookie'];
  const deck = await request(app).post('/api/decks').set('Cookie', cookie).send({ name: 'Ev' });
  const card = await request(app)
    .post(`/api/decks/${deck.body._id}/cards`)
    .set('Cookie', cookie)
    .send({ front: 'secret word', back: 'x' });
  return { cookie, deckId: deck.body._id, cardId: card.body._id };
}

describe('event log', () => {
  it('is a capped collection of 10 MB', async () => {
    await Event.init();
    const stats = await Event.db.db.command({ collStats: 'events' });
    expect(stats.capped).toBe(true);
    expect(stats.maxSize).toBe(EVENTS_MAX_BYTES);
  });

  it('records the study queue composition', async () => {
    const { cookie, deckId } = await bootstrap();
    await request(app).get(`/api/study/${deckId}`).set('Cookie', cookie).expect(200);

    const [e] = await waitForEvents({ type: 'study.queue' });
    expect(String(e.deckId)).toBe(deckId);
    expect(e.userId).toBeTruthy();
    expect(e.data).toEqual({
      due: 0,
      newServed: 1,
      newSlots: 20,
      newPerDay: 20,
      introducedToday: 0,
    });
  });

  it('records each review with SM-2 state before and after', async () => {
    const { cookie, cardId } = await bootstrap();
    await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'good' })
      .expect(200);

    const [e] = await waitForEvents({ type: 'study.review' });
    expect(String(e.cardId)).toBe(cardId);
    expect(e.data.grade).toBe('good');
    expect(e.data.firstReview).toBe(true);
    expect(e.data.before).toEqual({ repetitions: 0, interval: 0, ease: 2.5 });
    expect(e.data.after.repetitions).toBe(1);
  });

  it('never stores card text', async () => {
    const { cookie, deckId, cardId } = await bootstrap();
    await request(app).get(`/api/study/${deckId}`).set('Cookie', cookie);
    await request(app)
      .post(`/api/study/${cardId}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'hard' });
    const events = await waitForEvents({}, 2);
    expect(JSON.stringify(events)).not.toContain('secret word');
  });

  it('answers unexpected errors with a JSON 500 and records them', async () => {
    const { cookie } = await bootstrap();
    // invalid ObjectId → Mongoose CastError → unhandled → central handler
    const res = await request(app).get('/api/study/not-an-id').set('Cookie', cookie).expect(500);
    expect(res.body).toEqual({ error: 'Internal server error' });

    const [e] = await waitForEvents({ type: 'server.error' });
    expect(e.data.path).toBe('/api/study/not-an-id');
  });

  it('keeps client errors such as malformed JSON as 400', async () => {
    const { cookie } = await bootstrap();
    await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
  });
});
