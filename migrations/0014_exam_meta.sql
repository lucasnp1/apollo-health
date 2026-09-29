-- Draw details per blood test (where the date came from, draw time, fasted,
-- conditions) as one JSON column, so new fields need no migration.
-- Nullable, no backfill: older tests are judged at read time.
--
-- Apply directly, BEFORE deploying the code that sends it (this database
-- predates the migrations table):
--   npx wrangler d1 execute apollo-health-db --remote --file migrations/0014_exam_meta.sql

ALTER TABLE exams ADD COLUMN meta TEXT;
