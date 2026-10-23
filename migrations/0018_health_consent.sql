-- Explicit consent (GDPR Art. 9(2)(a)) to store the health log on Magno's servers: when the person said yes, from the
-- iPhone app's consent screen. Null = not given; the log then stays on the phone only.
ALTER TABLE users ADD COLUMN health_consent_at INTEGER;
