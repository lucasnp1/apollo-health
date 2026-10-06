-- Blood-letting: therapeutic venesections and donations, logged beside the
-- blood tests so hematocrit can be read against them.
--
-- Apply directly, not via `wrangler d1 migrations apply`: this database
-- predates the migrations table.

CREATE TABLE IF NOT EXISTS phlebotomies (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_at    TEXT NOT NULL,
  kind            TEXT NOT NULL,
  volume_ml       REAL,
  place           TEXT,
  notes           TEXT,
  archived_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_phlebotomies_user_updated ON phlebotomies(user_id, updated_at);
