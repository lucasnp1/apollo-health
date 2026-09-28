-- The logger tied the vial type to the route (SubQ = powder + bac water), so a
-- 100 mg/mL oil drawn subq with an insulin syringe could not be entered, and
-- every syringe was assumed to be a 1 mL insulin one. Vial kind, syringe and
-- entry mode are now remembered per compound.
--
-- Explicit columns on purpose: the sync pull never lets NULL overwrite a held
-- value, so "powder because vial_mg is set" could never switch back to liquid
-- across devices.
--   vial_kind:  'liquid' | 'powder'
--   syringe:    'u30' | 'u50' | 'u100' | 'ml1' | 'ml2' | 'ml3'
--   entry_mode: 'dose' | 'draw'
-- Nullable, no DEFAULT, no CHECK. NULL = never saved by the new logger; the
-- client infers it (src/lib/vials.ts vialOf).
--
-- Apply directly, BEFORE deploying the code that sends these fields (this
-- database predates the migrations table, see project_apollo_sellable):
--   npx wrangler d1 execute apollo-health-db --remote --file migrations/0012_compound_vial_syringe.sql

ALTER TABLE compounds ADD COLUMN vial_kind  TEXT;
ALTER TABLE compounds ADD COLUMN syringe    TEXT;
ALTER TABLE compounds ADD COLUMN entry_mode TEXT;
