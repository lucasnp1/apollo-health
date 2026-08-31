-- Billing: per-user plan state, driven by Stripe webhooks.
-- Additive only (nullable / defaulted columns) so it is safe to apply to a live
-- database and invisible to the app until billing is enabled.

ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';   -- 'free' | 'pro'
ALTER TABLE users ADD COLUMN plan_kind TEXT;                      -- 'monthly' | 'yearly' | 'lifetime'
ALTER TABLE users ADD COLUMN plan_until INTEGER;                  -- epoch ms; NULL = lifetime / n/a
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription ON users(stripe_subscription_id);
