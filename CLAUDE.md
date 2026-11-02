# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vadanki — an AnkiWeb-style spaced-repetition flashcard app. Google Gemini auto-generates the translation and an example sentence when you add a word. Single Express 5 service serving a JSON API + static vanilla-JS frontend, backed by MongoDB Atlas, deployed to Render.

## Commands

```sh
npm start          # node server.js
npm test           # jest via --experimental-vm-modules --runInBand (ESM; mocks break without runInBand)
npm test -- tests/study.test.js   # single file
npm run lint       # eslint .
npm run format     # prettier --write .
npm run seed       # DESTRUCTIVE: recreates demo@example.com/demo1234 in whatever MONGODB_URI points to (incl. Atlas)
```

## Required env vars

Copy `.env.example` and fill in:
- `MONGODB_URI` — MongoDB Atlas connection string
- `GEMINI_API_KEY` — Google AI Studio key (free tier)
- `JWT_SECRET` — random string for signing JWT cookies
- `APP_TZ` (optional, default `Europe/Kyiv`) — day boundary (`services/day.js`) for the new-card cap and deck counts. AI quotas ignore it and reset at UTC midnight.
- Optional: `PORT`, `AI_DAILY_LIMIT_USER/GLOBAL`, `TURNSTILE_SECRET_KEY/SITE_KEY`, `EVENT_LOG` (see below).

Never commit `.env`.

## Architecture

Single Express app: `/api/*` routes return JSON; everything else serves `/public` as static files. Mongoose connects to Atlas. Gemini is called only in `services/geminiService.js` — the key **never reaches the browser**.

`card.back` is stored as HTML (`<b>translation</b><br><i>example</i>`) and rendered via `innerHTML` in `public/app.js` — it is not sanitized.

## Logging

- `middleware/requestLog.js` — one JSON line per `/api/*` request (method, path, status, ms, userId) to stdout; Render keeps 7 days on Hobby. Silent under `NODE_ENV=test`.
- Central error handler in `server.js` — 5xx → logged with stack, `server.error` event, generic `{ error: 'Internal server error' }`; 4xx keep their message.
- `services/eventLog.js` `logEvent(type, {...})` — fire-and-forget write to the capped `events` collection (`models/Event.js`, 10 MB, oldest dropped automatically). Event types: `study.queue`, `study.review`, `ai.call`, `ai.limited`, `server.error`. Disable with `EVENT_LOG=off`.
- **Never log card text, emails, tokens or cookies** — ids, counts, grades, timings, error codes only.
- Read events: `npm run events -- --email you@example.com --type study.queue --deck <deckId> --limit 50`.

## Security invariants (must not break)

- Every Mongoose query on `Deck` and `Card` must be scoped by the authenticated `userId`. Sole exception: `routes/admin.js`, which is guarded by `requireAdmin` (DB-checked `isAdmin` flag; grant via `node scripts/make-admin.js <email>`).
- JWT is stored in an httpOnly cookie only — never `localStorage`.
- Rate-limit auth routes (20/15min/IP, applied per route) and the Gemini-spending endpoints (10/min per userId): `/api/decks/:id/cards` POST, `/api/cards/:id/regenerate` POST. Register: 5/hour/IP, skipped under `NODE_ENV=test`.
- Registration is protected by Cloudflare Turnstile when `TURNSTILE_SECRET_KEY` is set (verification fails closed); the site key is only served to the frontend via `/api/auth/config`. Unset (dev/tests) → registration is open.
- Gemini calls are budgeted per day (`services/aiQuota.js`): `AI_DAILY_LIMIT_USER` per user and `AI_DAILY_LIMIT_GLOBAL` overall (defaults 50/500). Over budget → card still saves, `aiLimited: true` in the response.
- Tests must never call the real Gemini API — `tests/setup.js` deletes `GEMINI_API_KEY` and uses mongodb-memory-server. Gemini mocks (`jest.unstable_mockModule`) must live only in `tests/aiQuota.test.js`.
- All Gemini calls are server-side. On card create, a Gemini failure or skip (front > 200 chars) still saves the card, with `aiFailed`/`aiLimited` in the response. Regenerate returns errors instead (503/400/429/502).

## SM-2 scheduling (services/sm2.js)

Grade → quality: `again=0, hard=3, good=4, easy=5`.
- If `q < 3`: reset repetitions to 0, interval to 1; ease is unchanged.
- Else: repetitions++; interval = 1 (rep 1), 6 (rep 2), else `round(prev_interval × ease)`; `ease = max(1.3, ease + 0.1 − (5−q)×(0.08 + (5−q)×0.02))`.
- `dueDate = now + interval days`.
- **Due** = `lastReviewedAt != null && dueDate <= now`. Never key it off `repetitions`, because "again" resets that to 0. Keep `routes/study.js` and `routes/decks.js` in sync.
- **New** = `lastReviewedAt: null`. The daily cap (`deck.newPerDay`) counts `introducedAt` (first review) since local midnight. Skip the query when slots = 0, because `limit(0)` means no limit.
- **Learned** = `lastGrade` is good/easy (`services/deckStats.js`).

## Gemini (services/geminiService.js)

Models: `gemini-2.5-flash`, then fall back to `gemini-2.5-flash-lite` on 429 or parse errors; retry once on 5xx. JSON-only prompt (`{ "translation": "...", "exampleSentence": "..." }`); strip fences or take the text from the first `{` to the last `}`; return `null` after all models fail.

## Deployment notes

Render free tier sleeps after 15 min idle (~30–50s cold start). `/healthz` endpoint is the keep-alive target. To remove sleep, upgrade to paid ($7/mo).

`render.yaml` pins `region: oregon` (the Gemini free tier blocks EEA IPs, so don't move it). Only `NODE_ENV`, `MONGODB_URI`, `GEMINI_API_KEY` and `JWT_SECRET` are declared there; set `TURNSTILE_*`, `AI_DAILY_LIMIT_*`, `APP_TZ` and `EVENT_LOG` in the Render dashboard.
