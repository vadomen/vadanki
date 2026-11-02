# WORKFLOW.md

How to take a change in Vadanki from request to production. Project facts and invariants live in [AGENTS.md](AGENTS.md); this file is the order of work. `CLAUDE.md` imports both.

The owner talks to you in Ukrainian — reply in Ukrainian, short and decision-ready. Code, comments, commits and docs stay in English.

## 1. Understand before changing

- Read the routes/services the request touches and the relevant AGENTS.md section (SM-2, security invariants, logging).
- "Why does the app show X" questions: look at real data before theorizing.
  - `npm run events -- --email <owner email> --type study.queue --limit 30` — what Study served and why.
  - `npm run events -- --type ai.call` — Gemini outcomes, fallbacks, latency.
  - `node scripts/audit-db.js` — read-only consistency check.
  - Anything else against Atlas: read-only scripts only. **Never** run `npm run seed` / `/seed-db` against Atlas — it deletes and recreates the demo user.
- Say what you found in numbers (counts, dates), and separate what the data shows from what you infer from code.

## 2. Agree on scope when it's not obvious

- Small, clear fixes: just do them.
- Behaviour changes the owner will notice (what counts as "learned", daily caps, scheduling) or anything touching auth, rate limits or AI budgets: state the options with their trade-offs and wait for a choice.
- Don't change things nobody asked for; list them as suggestions at the end instead.

## 3. Bugs: reproduce with a failing test first

- Write a regression test that fails for the reported reason, then fix the code, then watch it pass.
- Comment the test with the root cause (see the `limit(0)` and lapsed-card tests in `tests/study.test.js`).
- If the fix changes a definition shared by several routes (due / new / learned / "today"), put it in one place (`services/deckStats.js`, `services/day.js`) and use it from every route.

## 4. Implement

- Every `Deck`/`Card` query is scoped by `userId`. `aggregate()` doesn't cast — convert ids to `ObjectId` yourself.
- New diagnostics go through `logEvent()` / `log()`; never log card text, emails, tokens or cookies.
- Gemini only in `services/geminiService.js`; tests mock it only in `tests/aiQuota.test.js`.
- Schema additions need a default that keeps existing documents valid — there are no migrations.

## 5. Verify

Run all three (the same as `/verify` and CI):

```sh
npm test
npm run lint
npx prettier --check .     # npm run format to fix
```

UI changes: also look at the result at phone width (the owner uses the app on an iPhone). `scripts/smoke-ui.mjs` drives a local server (`npm start`) with Playwright and saves screenshots to `scripts/`. Check the screenshots yourself before calling it done.

## 6. Commit

- Only when the owner asks. Stage explicitly — never `.env` or `.claude/settings.local.json`:
  `git add -A ':!.claude/settings.local.json'`
- One logical change per commit, imperative subject line, e.g. `Fix daily new-card cap for cards created on earlier days`.

## 7. Deploy

- `git push origin main` → GitHub Actions CI → Render auto-deploys (set to "After CI Checks Pass" if enabled). No manual step on Render.
- Watch Render Dashboard → vadanki → Events until the deploy is live (2–4 min), then open https://vadanki.onrender.com/healthz.
- Free tier sleeps after 15 min idle; the first request can take 30–50 s — that's not a failed deploy.
- New env vars: add them to `.env.example`, AGENTS.md and the Render dashboard (only the four in `render.yaml` are declared there).

## 8. After deploy

- Check Render → Logs for `"level":"error"` lines in the first minutes.
- For a fix to a behaviour the owner reported, confirm it with `npm run events` on the real data, not just tests.

## 9. Report back

- What changed and why, in a few lines; what was verified (tests, lint, screenshots) and what wasn't.
- Anything the owner must do (commit, push, set an env var) as copy-pasteable commands.
- Suggestions go last, clearly separated from what was done.
