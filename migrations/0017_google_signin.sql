-- Sign in with Google (iPhone app). google_sub is Google's stable user id.
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
