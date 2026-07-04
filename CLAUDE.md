# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vadanki — an AnkiWeb-style spaced-repetition flashcard app. Google Gemini auto-generates the translation and an example sentence when you add a word. Single Express 5 service serving a JSON API + static vanilla-JS frontend, backed by MongoDB Atlas, deployed to Render.

## Commands

```sh
npm start          # node server.js
npm test           # jest
npm run lint       # eslint .
npm run format     # prettier --write .
```

## Required env vars

Copy `.env.example` and fill in:
- `MONGODB_URI` — MongoDB Atlas connection string
- `GEMINI_API_KEY` — Google AI Studio key (gemini-2.5-flash, free tier)
- `JWT_SECRET` — random string for signing JWT cookies

Never commit `.env`.

## Architecture

Single Express app: `/api/*` routes return JSON; everything else serves `/public` as static files. Mongoose connects to Atlas. Gemini is called only in `services/geminiService.js` — the key **never reaches the browser**.

## Security invariants (must not break)

- Every Mongoose query on `Deck` and `Card` must be scoped by the authenticated `userId`. Sole exception: `routes/admin.js`, which is guarded by `requireAdmin` (DB-checked `isAdmin` flag; grant via `node scripts/make-admin.js <email>`).
- JWT is stored in an httpOnly cookie only — never `localStorage`.
- Rate-limit `/api/auth/*` (brute-force) and `/api/decks/:id/cards` POST (Gemini quota).
- All Gemini calls are server-side. Any Gemini failure returns `null`; the route still saves the card so the user can fill in the back manually.

## SM-2 scheduling (services/sm2.js)

Grade → quality: `again=0, hard=3, good=4, easy=5`.
- If `q < 3`: reset repetitions to 0, interval to 1.
- Else: repetitions++; interval = 1 (rep 1), 6 (rep 2), else `round(prev_interval × ease)`.
- `ease = max(1.3, ease + 0.1 − (5−q)×(0.08 + (5−q)×0.02))`.
- `dueDate = now + interval days`. New cards capped at `deck.newPerDay` per day.

## Gemini response parsing (services/geminiService.js)

Prompt requests JSON-only output: `{ "translation": "...", "exampleSentence": "..." }`.
Strip markdown fences before `JSON.parse`. Wrap in try/catch and return `null` on any error.

## Milestones

M1 Foundation → M2 Auth → M3 Decks & Cards CRUD → M4 Gemini → M5 Study (SM-2) → M6 Deploy (Render + Atlas).

## Deployment notes

Render free tier sleeps after 15 min idle (~30–50s cold start). `/healthz` endpoint is the keep-alive target. To remove sleep, upgrade to paid ($7/mo).
