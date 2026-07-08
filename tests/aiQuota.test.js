// All tests that mock the Gemini service live in this one file: with
// unstable_mockModule + --runInBand, two files mocking the same module can end
// up asserting on a different mock instance than the one the server captured.
import { jest } from '@jest/globals';
import request from 'supertest';
import { setup, teardown, clearDB } from './setup.js';

// The jest.fn must live outside the factory: jest may run the factory once per
// importing module (decks.js, cards.js, this file), and a fn created inside
// would give each importer its own instance — calls would land on one while
// assertions watch another.
const translateWord = jest.fn(async () => ({ translation: 'hola', exampleSentence: '¡Hola!' }));
jest.unstable_mockModule('../services/geminiService.js', () => ({ translateWord }));

const { default: app } = await import('../server.js');

beforeAll(async () => {
  await setup();
  // setup() deletes the real key; the route only calls (mocked) Gemini when set
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.AI_DAILY_LIMIT_USER = '2';
  process.env.AI_DAILY_LIMIT_GLOBAL = '100';
});
afterAll(async () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_DAILY_LIMIT_USER;
  delete process.env.AI_DAILY_LIMIT_GLOBAL;
  await teardown();
});
afterEach(async () => {
  translateWord.mockClear();
  await clearDB();
});

async function createUserAndDeck(email = 'user@example.com') {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });
  const cookie = reg.headers['set-cookie'];
  const deck = await request(app)
    .post('/api/decks')
    .set('Cookie', cookie)
    .send({ name: 'Deck', sourceLang: 'en', targetLang: 'es' });
  return { cookie, deckId: deck.body._id };
}

const addCard = ({ cookie, deckId }, front) =>
  request(app).post(`/api/decks/${deckId}/cards`).set('Cookie', cookie).send({ front });

describe('AI daily quota', () => {
  it('translates within the per-user budget, then saves without AI', async () => {
    const ctx = await createUserAndDeck();

    const first = await addCard(ctx, 'hello');
    expect(first.status).toBe(201);
    expect(first.body.back).toContain('hola');
    expect(first.body.aiLimited).toBe(false);

    await addCard(ctx, 'goodbye');

    const third = await addCard(ctx, 'please');
    expect(third.status).toBe(201);
    expect(third.body.aiLimited).toBe(true);
    expect(third.body.aiFailed).toBe(true);
    expect(third.body.back).toBe('');
    expect(translateWord).toHaveBeenCalledTimes(2);
  });

  it('enforces the global budget across users', async () => {
    process.env.AI_DAILY_LIMIT_GLOBAL = '1';
    try {
      const first = await createUserAndDeck('one@example.com');
      await addCard(first, 'hello');

      const second = await createUserAndDeck('two@example.com');
      const res = await addCard(second, 'water');
      expect(res.status).toBe(201);
      expect(res.body.aiLimited).toBe(true);
      expect(translateWord).toHaveBeenCalledTimes(1);
    } finally {
      process.env.AI_DAILY_LIMIT_GLOBAL = '100';
    }
  });

  it('does not consume quota when back is provided manually', async () => {
    const ctx = await createUserAndDeck();
    const res = await request(app)
      .post(`/api/decks/${ctx.deckId}/cards`)
      .set('Cookie', ctx.cookie)
      .send({ front: 'hello', back: 'hola' });
    expect(res.status).toBe(201);
    expect(translateWord).not.toHaveBeenCalled();
  });

  it('skips the AI call for overlong fronts', async () => {
    const ctx = await createUserAndDeck();
    const res = await addCard(ctx, 'x'.repeat(300));
    expect(res.status).toBe(201);
    expect(res.body.back).toBe('');
    expect(translateWord).not.toHaveBeenCalled();
  });
});

async function createCardWithBack(ctx, front = 'hello', back = 'old translation') {
  const card = await request(app)
    .post(`/api/decks/${ctx.deckId}/cards`)
    .set('Cookie', ctx.cookie)
    .send({ front, back });
  return card.body._id;
}

const regenerate = (ctx, cardId) =>
  request(app).post(`/api/cards/${cardId}/regenerate`).set('Cookie', ctx.cookie).send({});

describe('POST /api/cards/:id/regenerate', () => {
  it('replaces the back with a fresh AI translation', async () => {
    const ctx = await createUserAndDeck();
    const cardId = await createCardWithBack(ctx);
    const res = await regenerate(ctx, cardId);
    expect(res.status).toBe(200);
    expect(res.body.back).toBe('<b>hola</b><br><i>¡Hola!</i>');
    expect(translateWord).toHaveBeenCalledWith('hello', 'en', 'es');
  });

  it("404s for another user's card", async () => {
    const ctx = await createUserAndDeck();
    const cardId = await createCardWithBack(ctx);
    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: 'other@example.com', password: 'password123' });
    const res = await request(app)
      .post(`/api/cards/${cardId}/regenerate`)
      .set('Cookie', other.headers['set-cookie'])
      .send({});
    expect(res.status).toBe(404);
    expect(translateWord).not.toHaveBeenCalled();
  });

  it('keeps the old back and returns 502 when AI fails', async () => {
    const ctx = await createUserAndDeck();
    const cardId = await createCardWithBack(ctx);
    translateWord.mockResolvedValueOnce(null);
    const res = await regenerate(ctx, cardId);
    expect(res.status).toBe(502);

    const card = await request(app).get(`/api/cards/${cardId}`).set('Cookie', ctx.cookie);
    expect(card.body.back).toBe('old translation');
  });

  it('returns 429 when the daily AI budget is exhausted', async () => {
    process.env.AI_DAILY_LIMIT_USER = '1';
    try {
      const ctx = await createUserAndDeck();
      const cardId = await createCardWithBack(ctx);
      await regenerate(ctx, cardId);
      const res = await regenerate(ctx, cardId);
      expect(res.status).toBe(429);
      expect(translateWord).toHaveBeenCalledTimes(1);
    } finally {
      process.env.AI_DAILY_LIMIT_USER = '2';
    }
  });

  it('returns 503 when Gemini is not configured', async () => {
    const ctx = await createUserAndDeck();
    const cardId = await createCardWithBack(ctx);
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await regenerate(ctx, cardId);
      expect(res.status).toBe(503);
    } finally {
      process.env.GEMINI_API_KEY = 'test-key';
    }
  });
});
