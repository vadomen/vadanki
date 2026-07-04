import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../server.js';
import { setup, teardown, clearDB } from './setup.js';

const realFetch = global.fetch;

beforeAll(setup);
afterAll(async () => {
  global.fetch = realFetch;
  delete process.env.TURNSTILE_SECRET_KEY;
  await teardown();
});
afterEach(async () => {
  global.fetch = realFetch;
  delete process.env.TURNSTILE_SECRET_KEY;
  await clearDB();
});

function mockSiteverify(success) {
  global.fetch = jest.fn(async () => ({ json: async () => ({ success }) }));
}

const register = (body) => request(app).post('/api/auth/register').send(body);

describe('Turnstile on registration', () => {
  it('registers without a token when Turnstile is not configured', async () => {
    const res = await register({ email: 'a@example.com', password: 'password123' });
    expect(res.status).toBe(201);
  });

  it('rejects registration without a token when configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    mockSiteverify(true);
    const res = await register({ email: 'b@example.com', password: 'password123' });
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects registration when Cloudflare says the token is invalid', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    mockSiteverify(false);
    const res = await register({
      email: 'c@example.com',
      password: 'password123',
      turnstileToken: 'bad-token',
    });
    expect(res.status).toBe(400);
  });

  it('registers when Cloudflare validates the token', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    mockSiteverify(true);
    const res = await register({
      email: 'd@example.com',
      password: 'password123',
      turnstileToken: 'good-token',
    });
    expect(res.status).toBe(201);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails closed when the siteverify request errors', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    });
    const res = await register({
      email: 'e@example.com',
      password: 'password123',
      turnstileToken: 'token',
    });
    expect(res.status).toBe(400);
  });

  it('does not gate login with Turnstile', async () => {
    const reg = await register({ email: 'f@example.com', password: 'password123' });
    expect(reg.status).toBe(201);
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    mockSiteverify(false);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'f@example.com', password: 'password123' });
    expect(res.status).toBe(200);
  });

  it('exposes the site key (and nothing else) via /api/auth/config', async () => {
    process.env.TURNSTILE_SITE_KEY = 'public-site-key';
    try {
      const res = await request(app).get('/api/auth/config');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ turnstileSiteKey: 'public-site-key' });
    } finally {
      delete process.env.TURNSTILE_SITE_KEY;
    }
  });
});
