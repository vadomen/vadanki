import { jest } from '@jest/globals';
import request from 'supertest';
import { setup, teardown, clearDB } from './setup.js';

jest.unstable_mockModule('../services/geminiService.js', () => ({
  translateWord: jest.fn(async () => ({ translation: 'hola', exampleSentence: '¡Hola!' })),
}));

const { default: app } = await import('../server.js');
const { translateWord } = await import('../services/geminiService.js');

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
