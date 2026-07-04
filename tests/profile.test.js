import request from 'supertest';
import app from '../server.js';
import { setup, teardown, clearDB } from './setup.js';

beforeAll(setup);
afterAll(teardown);
afterEach(clearDB);

async function registerAndGetCookie(email = 'user@example.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123' });
  return res.headers['set-cookie'];
}

describe('GET /api/auth/me', () => {
  it('returns the current user profile', async () => {
    const cookie = await registerAndGetCookie();
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('user@example.com');
    expect(res.body.name).toBe('');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates name and email', async () => {
    const cookie = await registerAndGetCookie();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ name: 'Vadim', email: 'new@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Vadim');
    expect(res.body.email).toBe('new@example.com');
  });

  it('rejects an empty email', async () => {
    const cookie = await registerAndGetCookie();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ email: '  ' });
    expect(res.status).toBe(400);
  });

  it('rejects an email already taken by another user', async () => {
    await registerAndGetCookie('taken@example.com');
    const cookie = await registerAndGetCookie();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });

  it('changes the password when the current password is correct', async () => {
    const cookie = await registerAndGetCookie();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ currentPassword: 'password123', newPassword: 'newpassword456' });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'newpassword456' });
    expect(login.status).toBe(200);
  });

  it('rejects a password change with a wrong current password', async () => {
    const cookie = await registerAndGetCookie();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpassword456' });
    expect(res.status).toBe(401);
  });

  it('rejects a short new password', async () => {
    const cookie = await registerAndGetCookie();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ currentPassword: 'password123', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});
