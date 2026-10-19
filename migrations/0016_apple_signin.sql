-- Sign in with Apple (iPhone app, 19 Oct 2026). apple_sub is Apple's stable user id for this app; an account made
-- with Apple has no password (has_password 0) until one is set. apple_refresh_token is kept only so the Apple login
-- can be revoked when the account is deleted (Apple requires it).
ALTER TABLE users ADD COLUMN apple_sub TEXT;
ALTER TABLE users ADD COLUMN apple_refresh_token TEXT;
ALTER TABLE users ADD COLUMN has_password INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub);
