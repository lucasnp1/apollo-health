-- In-app feedback. Stored server-side (no email dependency for now); an admin
-- can read it via GET /api/feedback.
CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  email      TEXT,
  message    TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
