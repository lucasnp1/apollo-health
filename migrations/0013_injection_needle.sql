-- Optional needle per shot ("25G 1 in (25 mm)"), picked under the syringe
-- on the logger. Free text so new sizes need no migration. Nullable, no
-- backfill: older shots simply have none.
--
-- Apply directly, BEFORE deploying the code that sends it (this database
-- predates the migrations table):
--   npx wrangler d1 execute apollo-health-db --remote --file migrations/0013_injection_needle.sql

ALTER TABLE injections ADD COLUMN needle TEXT;
