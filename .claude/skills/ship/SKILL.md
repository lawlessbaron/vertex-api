---
name: ship
description: Ship the API site — only when the user says "push it"/"ship it". Runs /qa, bumps the version and CHANGELOG.md, then the guarded commit and push to main (Railway deploys main).
---

# /ship — push the API site live

Only after the user says to push. Show screenshots first for any design change.

1. `/qa` steps; stop on any failure.
2. Bump `package.json` version, add a CHANGELOG.md entry (plain words).
3. Guarded push:
   ```
   npm test 2>&1 | grep -q "^# fail 0" && git add -A && git commit -q -m "<version>: <summary>

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: <session url>" && git push -q origin main && echo SHIPPED
   ```
   `public/film/` is local-only (in .git/info/exclude) — never commit it.
4. After ~2 minutes run `/check-live` (it lives in the VERTEX repo and covers both services).
