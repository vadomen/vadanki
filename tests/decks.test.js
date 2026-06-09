import request from 'supertest';
import app from '../server.js';
import { setup, teardown, clearDB } from './setup.js';

beforeAll(setup);
afterAll(teardown);
afterEach(clearDB);

async function registerAndGetCookie() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: 'user@example.com', password: 'password123' });
  return res.headers['set-cookie'];
}

describe('Decks CRUD', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await registerAndGetCookie();
  });

  it('creates and lists a deck', async () => {
    await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'Spanish', sourceLang: 'en', targetLang: 'es' })
      .expect(201);

    const res = await request(app).get('/api/decks').set('Cookie', cookie).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Spanish');
    expect(res.body[0].total).toBe(0);
  });

  it('updates a deck', async () => {
    const create = await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'Old Name' });
    const id = create.body._id;

    const res = await request(app)
      .patch(`/api/decks/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'New Name' })
      .expect(200);
    expect(res.body.name).toBe('New Name');
  });

  it('deletes a deck and its cards', async () => {
    const create = await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'To Delete' });
    const id = create.body._id;

    await request(app)
      .post(`/api/decks/${id}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'hello' })
      .expect(201);

    await request(app).delete(`/api/decks/${id}`).set('Cookie', cookie).expect(200);

    const cards = await request(app)
      .get(`/api/decks/${id}/cards`)
      .set('Cookie', cookie)
      .expect(404);
    expect(cards.body.error).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    await request(app).get('/api/decks').expect(401);
  });

  it("cannot access another user's deck", async () => {
    const deck = await request(app).post('/api/decks').set('Cookie', cookie).send({ name: 'Mine' });
    const id = deck.body._id;

    const otherCookie = (
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'other@example.com', password: 'password123' })
    ).headers['set-cookie'];

    await request(app).delete(`/api/decks/${id}`).set('Cookie', otherCookie).expect(404);
  });
});

describe('Cards CRUD', () => {
  let cookie, deckId;

  beforeEach(async () => {
    cookie = await registerAndGetCookie();
    const deck = await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'Test Deck' });
    deckId = deck.body._id;
  });

  it('creates and lists cards', async () => {
    await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'hello', back: 'hola' })
      .expect(201);

    const res = await request(app)
      .get(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].front).toBe('hello');
  });

  it('edits a card', async () => {
    const card = await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'hello' });
    const cardId = card.body._id;

    const res = await request(app)
      .patch(`/api/cards/${cardId}`)
      .set('Cookie', cookie)
      .send({ back: 'hola' })
      .expect(200);
    expect(res.body.back).toBe('hola');
  });

  it('deletes a card', async () => {
    const card = await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'hello' });
    const cardId = card.body._id;

    await request(app).delete(`/api/cards/${cardId}`).set('Cookie', cookie).expect(200);

    const res = await request(app).get(`/api/decks/${deckId}/cards`).set('Cookie', cookie);
    expect(res.body).toHaveLength(0);
  });
});
