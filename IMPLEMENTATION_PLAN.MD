# vadanki — Implementation Plan

AnkiWeb-style spaced-repetition flashcard app where Google Gemini auto-generates the
translation and an example sentence when you add a word.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime/framework | Node.js + Express 5 | Single service serves API + static frontend |
| Database | MongoDB Atlas (free M0) via Mongoose | ~512 MB free forever |
| AI | Google Gemini, `gemini-2.5-flash` via `@google/genai` | Flash is free-tier; Pro is paid-only since Apr 2026 |
| Frontend | Plain HTML/CSS/vanilla JS (served as static files) | Keep MVP simple; can swap to React later |
| Auth | email + password, bcrypt hash, JWT (httpOnly cookie) | |
| Host | Render free web service | Sleeps after 15 min idle (~30–50s cold start) |

## 2. Architecture

A single Express app. `/api/*` routes return JSON; everything else serves the static
frontend from `/public`. The frontend calls the API with fetch. Gemini is called only
server-side (key never reaches the browser). MongoDB Atlas is the only external data store.

```
Browser (static HTML/JS)  ──HTTPS──>  Express app (Render)
                                          ├── /api/auth        (bcrypt + JWT cookie)
                                          ├── /api/decks       (CRUD, scoped by userId)
                                          ├── /api/cards       (CRUD + Gemini on create)
                                          ├── /api/study       (SM-2 scheduling)
                                          ├── Mongoose ─────>  MongoDB Atlas (M0)
                                          └── geminiService ─> Gemini API (gemini-2.5-flash)
```

## 3. Data Model (Mongoose)

```
User  { _id, email (unique), passwordHash, createdAt }
Deck  { _id, userId(ref), name, sourceLang, targetLang, newPerDay (default 20), createdAt }
Card  { _id, deckId(ref), userId(ref), front, back, exampleSentence,
        ease (default 2.5), interval (days, default 0), repetitions (default 0),
        dueDate (default now), lastReviewedAt, createdAt }
```
Indexes: `Card { userId, deckId, dueDate }` for fast due-card queries; `User { email }` unique.

## 4. API Routes

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/register | create user |
| POST | /api/auth/login | set JWT cookie |
| POST | /api/auth/logout | clear cookie |
| GET | /api/decks | list decks with new/due/total counts |
| POST | /api/decks | create deck |
| PATCH | /api/decks/:id | rename / settings |
| DELETE | /api/decks/:id | delete deck + its cards |
| GET | /api/decks/:id/cards | list cards in deck |
| POST | /api/decks/:id/cards | create card → calls Gemini for back + example |
| PATCH | /api/cards/:id | edit card |
| DELETE | /api/cards/:id | delete card |
| GET | /api/study/:deckId | next batch of due + new cards |
| POST | /api/study/:cardId/review | body `{ grade: again\|hard\|good\|easy }` → SM-2 update |
| GET | /healthz | uptime/keep-alive ping |

Every query is scoped by the authenticated `userId`.

## 5. SM-2 Scheduling

On review, map grade → quality `q` (again=0, hard=3, good=4, easy=5).
- If `q < 3`: `repetitions = 0`, `interval = 1` (card relapses, shown again soon).
- Else: `repetitions += 1`; interval = 1 (rep 1), 6 (rep 2), else `round(interval * ease)`.
- Update ease: `ease = max(1.3, ease + (0.1 - (5-q)*(0.08 + (5-q)*0.02)))`.
- `dueDate = now + interval days`; set `lastReviewedAt`.
  New cards are introduced up to `newPerDay` per deck per day. "Due" = `dueDate <= now`.

## 6. Gemini Integration

`services/geminiService.js` exports `translateWord(word, sourceLang, targetLang)`:
- Calls `gemini-2.5-flash` with a prompt instructing **JSON-only** output:
  `{ "translation": "...", "exampleSentence": "..." }`.
- Parse defensively: strip ``` fences, `JSON.parse` inside try/catch.
- On any failure (quota/network), return `null` so the route still lets the user save the
  card with a manually entered back. One Gemini call per card creation.
- Key from `process.env.GEMINI_API_KEY`. Light rate-limit on the create-card endpoint.

## 7. Folder Structure

```
vadanki/
├── server.js              # Express app entry; serves /public + /api
├── config/db.js           # Mongoose connection
├── models/                # User.js, Deck.js, Card.js
├── routes/                # auth.js, decks.js, cards.js, study.js
├── middleware/            # auth.js (JWT), rateLimit.js
├── services/              # geminiService.js, sm2.js
├── public/                # index.html, decks.html, study.html, app.js, styles.css
├── scripts/seed.js        # demo user + sample deck/cards
├── .env.example
├── .gitignore             # node_modules, .env
├── package.json           # "start": "node server.js", engines.node pinned
└── README.md
```

## 8. Milestones

- **M1 — Foundation:** project scaffold, Express + Mongoose connection, env config, `.env.example`, healthz.
- **M2 — Auth:** register/login/logout, bcrypt, JWT cookie, auth middleware.
- **M3 — Decks & Cards CRUD:** models, routes, deck list with counts, card editing. (No AI yet.)
- **M4 — Gemini:** `geminiService`, wire into card creation, defensive parsing + fallback.
- **M5 — Study (SM-2):** `sm2.js`, study/review routes, study screen (space to flip, 1–4 to grade).
- **M6 — Deploy:** push to GitHub, Render web service, Atlas cluster, env vars, smoke test.

## 9. Security & Config

- Secrets via env only: `MONGODB_URI`, `GEMINI_API_KEY`, `JWT_SECRET`. Never committed.
- Validate/sanitize all input; passwords hashed with bcrypt; JWT in httpOnly cookie.
- Rate-limit auth and card-create (Gemini) endpoints. Scope every DB query by `userId`.

## 10. Deployment (free tier end-to-end)

1. **MongoDB Atlas:** create free M0 cluster → DB user → network access `0.0.0.0/0`
   (simple for now; tighter is to allowlist Render's egress IPs) → copy `MONGODB_URI`.
2. **Gemini:** generate `GEMINI_API_KEY` in Google AI Studio.
3. **Render:** New → Web Service → connect this GitHub repo → Build `npm install`,
   Start `npm start`, Instance **Free**, add the three env vars → deploy.
4. **Cold start:** free instance sleeps after 15 min idle (~30–50s wake). Optional fix:
   external cron (e.g. cron-job.org) pinging `/healthz` every 14 min — a workaround, not a
   real always-on (pay $7/mo to remove sleep).
5. **Smoke test:** live URL loads → register → add a card and confirm AI translation →
   run a study session and confirm scheduling.
