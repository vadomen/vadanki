import request from 'supertest';
import app from '../server.js';
import { parseCSV, serializeCSV } from '../services/csv.js';
import { setup, teardown, clearDB } from './setup.js';

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses a simple header + data row', () => {
    const rows = parseCSV('front,back,exampleSentence\nhello,hola,¡Hola!');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['hello', 'hola', '¡Hola!']);
  });

  it('handles quoted fields containing commas', () => {
    const rows = parseCSV('"hello, world","hola, mundo",');
    expect(rows[0][0]).toBe('hello, world');
    expect(rows[0][1]).toBe('hola, mundo');
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const rows = parseCSV('"say ""hi""",saluda,');
    expect(rows[0][0]).toBe('say "hi"');
  });

  it('handles Windows line endings', () => {
    const rows = parseCSV('front,back\r\nhello,hola');
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('hello');
  });

  it('skips blank lines', () => {
    const rows = parseCSV('hello,hola\n\n\nbye,adiós');
    expect(rows).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(parseCSV('')).toHaveLength(0);
    expect(parseCSV('   \n  \n')).toHaveLength(0);
  });
});

describe('serializeCSV', () => {
  it('writes header row', () => {
    const csv = serializeCSV([]);
    expect(csv).toBe('front,back,exampleSentence');
  });

  it('quotes all fields', () => {
    const csv = serializeCSV([{ front: 'hello', back: 'hola', exampleSentence: 'Hi!' }]);
    expect(csv).toContain('"hello","hola","Hi!"');
  });

  it('escapes quotes inside fields', () => {
    const csv = serializeCSV([{ front: 'say "hi"', back: '', exampleSentence: '' }]);
    expect(csv).toContain('"say ""hi"""');
  });

  it('handles commas inside fields without breaking parsing', () => {
    const card = { front: 'a,b', back: 'c,d', exampleSentence: '' };
    const csv = serializeCSV([card]);
    const rows = parseCSV(csv);
    expect(rows[1][0]).toBe('a,b');
    expect(rows[1][1]).toBe('c,d');
  });

  it('round-trips correctly', () => {
    const cards = [
      { front: 'hello', back: 'hola', exampleSentence: '¡Hola!' },
      { front: 'say "hi"', back: 'di "hola"', exampleSentence: 'He said, "hi"' },
    ];
    const rows = parseCSV(serializeCSV(cards));
    expect(rows[1]).toEqual(['hello', 'hola', '¡Hola!']);
    expect(rows[2]).toEqual(['say "hi"', 'di "hola"', 'He said, "hi"']);
  });
});

// ── Route integration tests ───────────────────────────────────────────────────

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
  return { cookie, deckId: deck.body._id };
}

describe('GET /api/decks/:id/export.csv', () => {
  it('returns CSV with header only for empty deck', async () => {
    const { cookie, deckId } = await bootstrap();
    const res = await request(app)
      .get(`/api/decks/${deckId}/export.csv`)
      .set('Cookie', cookie)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toBe('front,back,exampleSentence');
  });

  it('exports cards as CSV', async () => {
    const { cookie, deckId } = await bootstrap();
    await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'hello', back: 'hola', exampleSentence: '¡Hola!' });

    const res = await request(app)
      .get(`/api/decks/${deckId}/export.csv`)
      .set('Cookie', cookie)
      .expect(200);

    const rows = parseCSV(res.text);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('hello');
    expect(rows[1][1]).toBe('hola');
    expect(rows[1][2]).toBe('¡Hola!');
  });

  it('returns 401 without auth', async () => {
    const { deckId } = await bootstrap();
    await request(app).get(`/api/decks/${deckId}/export.csv`).expect(401);
  });
});

describe('POST /api/decks/:id/import', () => {
  it('imports cards from CSV with header', async () => {
    const { cookie, deckId } = await bootstrap();
    const csv = 'front,back,exampleSentence\nhello,hola,¡Hola!\ngoodbye,adiós,';

    const res = await request(app)
      .post(`/api/decks/${deckId}/import`)
      .set('Cookie', cookie)
      .send({ csv })
      .expect(201);

    expect(res.body.imported).toBe(2);

    const cards = await request(app).get(`/api/decks/${deckId}/cards`).set('Cookie', cookie);
    expect(cards.body).toHaveLength(2);
    expect(cards.body.map((c) => c.front)).toContain('hello');
  });

  it('imports CSV without header row', async () => {
    const { cookie, deckId } = await bootstrap();
    const res = await request(app)
      .post(`/api/decks/${deckId}/import`)
      .set('Cookie', cookie)
      .send({ csv: 'hello,hola,\ngoodbye,adiós,' })
      .expect(201);
    expect(res.body.imported).toBe(2);
  });

  it('handles round-trip export→import', async () => {
    const { cookie, deckId } = await bootstrap();
    await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .set('Cookie', cookie)
      .send({ front: 'say "hi"', back: 'di "hola"', exampleSentence: 'He said, "hi"' });

    const { text } = await request(app)
      .get(`/api/decks/${deckId}/export.csv`)
      .set('Cookie', cookie);

    const deck2 = await request(app)
      .post('/api/decks')
      .set('Cookie', cookie)
      .send({ name: 'Deck 2' });

    const imp = await request(app)
      .post(`/api/decks/${deck2.body._id}/import`)
      .set('Cookie', cookie)
      .send({ csv: text })
      .expect(201);
    expect(imp.body.imported).toBe(1);

    const cards = await request(app)
      .get(`/api/decks/${deck2.body._id}/cards`)
      .set('Cookie', cookie);
    expect(cards.body[0].front).toBe('say "hi"');
  });

  it('rejects missing csv field', async () => {
    const { cookie, deckId } = await bootstrap();
    await request(app)
      .post(`/api/decks/${deckId}/import`)
      .set('Cookie', cookie)
      .send({})
      .expect(400);
  });

  it('rejects CSV with no valid data rows', async () => {
    const { cookie, deckId } = await bootstrap();
    await request(app)
      .post(`/api/decks/${deckId}/import`)
      .set('Cookie', cookie)
      .send({ csv: 'front,back,exampleSentence' })
      .expect(400);
  });

  it('returns 401 without auth', async () => {
    const { deckId } = await bootstrap();
    await request(app).post(`/api/decks/${deckId}/import`).send({ csv: 'hello,hola,' }).expect(401);
  });
});
