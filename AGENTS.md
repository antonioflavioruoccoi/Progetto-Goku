# Dr. Goku

Repository: `antonioflavioruoccoi/Progetto-Goku`.
Production branch: `feat/cloudflare-simple-hosting`; `feat/pokeprice` contains
the same multiplayer application. `main` is an older standalone quiz.

The user requires direct publication after changes and checks. Complete the
authorized work, run `npm test` and `npm run check`, publish through the existing
Cloudflare Git integration, and verify the live `/version.json` and affected
flows. Do not stop at a local build or ask again for permission to publish.
If authentication or deployment fails, report the specific blocker accurately.

Production: https://dr-goku.antonioflavioruocco-i.workers.dev/
Keep the existing Worker name, GOKU binding and SQLite migration identifiers:
changing those can disconnect the application from its saved data.

Frontend: `web/`; server authority: `worker/index.js`; build: `scripts/build.mjs`.
Keep answer timing, scoring, license permissions and persistence on the server.
For browser checks use Agent Browser with isolated host/player sessions.
