-- Custom symptoms. Every symptom used to be its own column, which meant a
-- migration plus four source edits to add one, and made user-defined symptoms
-- impossible at any price. `extras` holds them as JSON instead, self-describing
-- (value + label + direction per key) so a custom symptom syncs and renders
-- everywhere without a second table to keep aligned.
--
-- Apply directly, not via `wrangler d1 migrations apply`: this database
-- predates the migrations table.

ALTER TABLE symptoms ADD COLUMN extras TEXT;
