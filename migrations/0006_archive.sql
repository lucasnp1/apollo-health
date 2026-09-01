-- Archive (not delete). archived_at != NULL = archived: hidden from the app but
-- kept and restorable. "Deleting" anywhere in the app now sets this instead of
-- removing rows. Covers every user-facing log entity.
ALTER TABLE injections   ADD COLUMN archived_at INTEGER;
ALTER TABLE results      ADD COLUMN archived_at INTEGER;
ALTER TABLE exams        ADD COLUMN archived_at INTEGER;
ALTER TABLE files        ADD COLUMN archived_at INTEGER;
ALTER TABLE vitals       ADD COLUMN archived_at INTEGER;
ALTER TABLE body_metrics ADD COLUMN archived_at INTEGER;
ALTER TABLE symptoms     ADD COLUMN archived_at INTEGER;
