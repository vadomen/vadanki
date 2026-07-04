import request from 'supertest';
import app from '../server.js';
import User from '../models/User.js';
import { setup, teardown, clearDB } from './setup.js';

beforeAll(setup);
afterAll(teardown);
afterEach(clearDB);

async function registerAndGetCookie(email) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });
  return res.headers['set-cookie'];
}

async function makeAdmin(email) {
  await User.updateOne({ email }, { $set: { isAdmin: true } });
}

describe('GET /api/admin/users', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin users', async () => {
    const cookie = await registerAndGetCookie('regular@example.com');
    const res = await request(app).get('/api/admin/users').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('returns all users with their decks and card counts for admins', async () => {
    const adminCookie = await registerAndGetCookie('admin@example.com');
    await makeAdmin('admin@example.com');

    const userCookie = await registerAndGetCookie('someone@example.com');
    const deck = await request(app)
      .post('/api/decks')
      .set('Cookie', userCookie)
      .send({ name: 'Spanish', sourceLang: 'en', targetLang: 'es' });
    await request(app)
      .post(`/api/decks/${deck.body._id}/cards`)
      .set('Cookie', userCookie)
      .send({ front: 'hello', back: 'hola' });

    const res = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const admin = res.body.find((u) => u.email === 'admin@example.com');
    expect(admin.isAdmin).toBe(true);
    expect(admin.decks).toEqual([]);
    expect(admin.totalCards).toBe(0);

    const someone = res.body.find((u) => u.email === 'someone@example.com');
    expect(someone.isAdmin).toBe(false);
    expect(someone.decks).toHaveLength(1);
    expect(someone.decks[0].name).toBe('Spanish');
    expect(someone.decks[0].cardCount).toBe(1);
    expect(someone.totalCards).toBe(1);
  });

  it('does not expose password hashes', async () => {
    const cookie = await registerAndGetCookie('admin2@example.com');
    await makeAdmin('admin2@example.com');
    const res = await request(app).get('/api/admin/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});

describe('GET /api/auth/me', () => {
  it('includes the isAdmin flag', async () => {
    const cookie = await registerAndGetCookie('admin3@example.com');
    await makeAdmin('admin3@example.com');
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });
});
