-- First-run onboarding, tracked per ACCOUNT so it shows exactly once ever
-- (across devices, and surviving local storage eviction). NULL = not yet shown.
ALTER TABLE users ADD COLUMN onboarded_at INTEGER;
