-- The per-compound values the injection logger remembers for next time were
-- only ever written to Dexie: they are absent from the sync catalog and from
-- this table, so they never left the device that typed them. That is why a
-- second device (or a reinstall) showed blank concentration and vial numbers,
-- worst on SubQ peptides where the concentration is derived from the vial pair
-- rather than typed, so there was nothing to fall back on.
--
-- Apply directly, not via `wrangler d1 migrations apply`: this database
-- predates the migrations table (see project_apollo_sellable).

ALTER TABLE compounds ADD COLUMN concentration_mg_per_ml REAL;
ALTER TABLE compounds ADD COLUMN default_route           TEXT;
ALTER TABLE compounds ADD COLUMN last_dose               REAL;
ALTER TABLE compounds ADD COLUMN vial_mg                 REAL;
ALTER TABLE compounds ADD COLUMN reconstitute_ml         REAL;
