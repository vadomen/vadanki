import request from 'supertest';
import app from '../server.js';
import Card from '../models/Card.js';
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

  it('counts only cards last graded good/easy as learned and reports a breakdown', async () => {
    const deck = await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'Progress' });
    const deckId = deck.body._id;

    const cardIds = [];
    for (const front of ['uno', 'dos', 'tres', 'cuatro', 'cinco']) {
      const card = await request(app)
        .post(`/api/decks/${deckId}/cards`)
        .set('Cookie', cookie)
        .send({ front, back: 'x' });
      cardIds.push(card.body._id);
    }

    const review = (id, grade) =>
      request(app).post(`/api/study/${id}/review`).set('Cookie', cookie).send({ grade });

    // good/easy -> learned; hard/again -> not learned; grades overwrite each
    // other (cardIds[3]: good then hard); cardIds[4] is never reviewed
    await review(cardIds[0], 'good');
    await review(cardIds[1], 'easy');
    await review(cardIds[2], 'again');
    await review(cardIds[3], 'good');
    const regraded = await review(cardIds[3], 'hard');
    expect(regraded.body.lastGrade).toBe('hard');

    const res = await request(app).get('/api/decks').set('Cookie', cookie).expect(200);
    const progress = res.body.find((d) => d._id === deckId);
    expect(progress.total).toBe(5);
    expect(progress.learned).toBe(2);
    expect(progress.breakdown).toEqual({ easy: 1, good: 1, hard: 1, again: 1, unseen: 1 });
  });

  it('reports new cards available today, capped by newPerDay', async () => {
    const deck = await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'New', newPerDay: 2 });
    const deckId = deck.body._id;

    const ids = [];
    for (const front of ['a', 'b', 'c']) {
      const card = await request(app)
        .post(`/api/decks/${deckId}/cards`)
        .set('Cookie', cookie)
        .send({ front, back: 'x' });
      ids.push(card.body._id);
    }

    const review = (id, grade) =>
      request(app).post(`/api/study/${id}/review`).set('Cookie', cookie).send({ grade });
    const newAvailable = async () =>
      (await request(app).get('/api/decks').set('Cookie', cookie)).body.find(
        (d) => d._id === deckId,
      ).newAvailable;

    expect(await newAvailable()).toBe(2);
    await review(ids[0], 'good');
    expect(await newAvailable()).toBe(1);
    await review(ids[1], 'again');
    expect(await newAvailable()).toBe(0);
  });

  // Regression: the due count must stay in step with the study queue — a
  // lapsed ("again") card has repetitions 0 but is still a real review.
  it('counts an overdue lapsed card as due', async () => {
    const deck = await request(app).post('/api/decks').set('Cookie', cookie).send({ name: 'Due' });
    const deckId = deck.body._id;

    const card = await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'lapsed', back: 'x' });

    await request(app)
      .post(`/api/study/${card.body._id}/review`)
      .set('Cookie', cookie)
      .send({ grade: 'again' });

    await Card.updateOne(
      { _id: card.body._id },
      { $set: { dueDate: new Date(Date.now() - 86400000) } },
    );

    const res = await request(app).get('/api/decks').set('Cookie', cookie).expect(200);
    expect(res.body.find((d) => d._id === deckId).due).toBe(1);
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

  it('finds existing cards by front or back text', async () => {
    await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'hello', back: 'hola' });
    await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'goodbye', back: 'adios' });

    const byFront = await request(app)
      .get('/api/cards/search?q=hel')
      .set('Cookie', cookie)
      .expect(200);
    expect(byFront.body).toHaveLength(1);
    expect(byFront.body[0].front).toBe('hello');
    expect(byFront.body[0].deckName).toBe('Test Deck');

    const byBack = await request(app)
      .get('/api/cards/search?q=adios')
      .set('Cookie', cookie)
      .expect(200);
    expect(byBack.body).toHaveLength(1);
    expect(byBack.body[0].front).toBe('goodbye');
  });

  it('search ignores queries shorter than 2 chars', async () => {
    const res = await request(app).get('/api/cards/search?q=a').set('Cookie', cookie).expect(200);
    expect(res.body).toEqual([]);
  });

  it("search does not return another user's cards", async () => {
    await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'secret', back: 'secreto' });

    const otherCookie = (
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'other@example.com', password: 'password123' })
    ).headers['set-cookie'];

    const res = await request(app)
      .get('/api/cards/search?q=secret')
      .set('Cookie', otherCookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });
});
