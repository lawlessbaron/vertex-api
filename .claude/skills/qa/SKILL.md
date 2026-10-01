---
name: qa
description: Full quality check of the API site before shipping — unit tests, a browser smoke test of every page, and screenshots of what changed. Use for /qa, "check it", "test everything", or before any ship.
---

# /qa — check the API site works

1. **Unit tests**: `npm test 2>&1 | grep -E "^# (pass|fail)"` — must be `# fail 0`.
2. **Smoke test**: `node scripts/smoke.mjs` — throwaway database, loads /, /docs,
   /status, /education, /signin, /console, /admin in Chromium; fails on any
   non-200 or script error.
3. **Signed-in screens**: for admin/console changes, seed a demo database
   (sessions + sample calls) and screenshot the changed tabs at 1440 and 390 px.
   Look at every screenshot before calling it done.
4. **Rules**: Australian English, no AI/engine vendor names in public text or
   CHANGELOG.md, no secrets, CSP-safe (no inline `<script>`/`<style>`; `style=""`
   attributes are allowed).
5. **CHANGELOG.md** updated and `package.json` version bumped.

Report a short PASS/FAIL table. Never commit or push from /qa.
