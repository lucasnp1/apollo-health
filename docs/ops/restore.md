# Restoring Magno's server data

Users' logs live on their phones first; the server (Cloudflare D1 `apollo-health-db`) holds backups for signed-in users.

- **Point-in-time restore:** D1 Time Travel keeps 30 days. `npx wrangler d1 time-travel info apollo-health-db` prints the
  current bookmark; `npx wrangler d1 time-travel restore apollo-health-db --timestamp=<ISO time>` rolls the whole DB back
  (in place, so first note the current bookmark to undo it).
- **Checked 23 Oct 2026:** time travel answers (bookmark 00000857-…-ea129a8a…). A full restore drill into a scratch
  database has **not** been run: it means exporting the health database, which Lucas should run or approve himself.
  Drill: `npx wrangler d1 export apollo-health-db --remote --output /tmp/magno.sql`, `npx wrangler d1 create magno-drill`,
  `npx wrangler d1 execute magno-drill --file /tmp/magno.sql`, compare row counts, then delete magno-drill and the file.
- **A user's own copy:** You > Export everything gives a JSON file of their whole log, on every plan.
