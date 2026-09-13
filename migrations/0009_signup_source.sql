-- 0009: first-party attribution. One short word per user saying which of our
-- own links they signed up from ("read", "guide-hematocrit", "reddit").
-- Apply remotely with:
--   npx wrangler d1 execute apollo-health-db --remote --file migrations/0009_signup_source.sql
ALTER TABLE users ADD COLUMN signup_source TEXT;
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);

-- Daily page counts for the public pages (/, /read, /guides/*). No cookie,
-- no IP, no user agent: a number per path per day.
CREATE TABLE IF NOT EXISTS page_hits (
  day  TEXT NOT NULL,
  path TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
