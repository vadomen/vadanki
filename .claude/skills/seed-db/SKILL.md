---
name: seed-db
description: Populate the database with a demo user and sample deck/cards for development and testing.
disable-model-invocation: true
---

Run `node scripts/seed.js` to seed the database with demo data.

Before running, confirm:
- The server is not required to be running (this script connects to MongoDB directly).
- `MONGODB_URI` is set in `.env` (the script will fail with a connection error if not).

Report the output of the seed script. If it fails, show the error message and likely cause (missing env var, Atlas network access, etc.).
