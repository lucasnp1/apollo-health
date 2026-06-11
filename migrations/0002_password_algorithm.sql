-- Phase 3 — Argon2id password hashing.
--
-- Existing users have `algorithm = 'pbkdf2'` (set by the default). On their
-- next successful login the auth path rehashes their password with
-- Argon2id and flips this column. New signups skip PBKDF2 entirely.
--
-- The PBKDF2 path remains in the codebase as a verification fallback so
-- users who haven't logged in yet aren't locked out.

ALTER TABLE users ADD COLUMN algorithm TEXT NOT NULL DEFAULT 'pbkdf2';
