# CLAUDE.md

Project guidance lives in AGENTS.md, shared by all coding agents:

@AGENTS.md

Order of work (understand → test → implement → verify → commit → deploy):

@WORKFLOW.md

## Claude Code specifics

- `/verify` — runs the same checks as CI (tests, lint, format). Don't call a feature done until it passes.
- `/seed-db` — seeds the demo user; destructive, see the `npm run seed` warning in AGENTS.md.
