---
name: verify
description: Run Jest tests and ESLint to verify the codebase is correct and clean before finishing a feature.
---

Run these two checks in sequence and report the results:

1. `npm test` — Jest unit tests. If any fail, show the failing test names and errors.
2. `npm run lint` — ESLint. If there are errors, show the file/line/message for each.

If both pass, confirm "All checks passed." If either fails, list the failures and suggest fixes. Do not mark a feature complete until both pass.
