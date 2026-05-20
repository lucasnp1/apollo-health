-- Apollo Health — multi-user backend schema (D1 / SQLite)
-- Conventions:
--   * Primary keys are TEXT (client-generated UUIDv4) so offline writes work.
--   * Every personal record carries user_id (TEXT) and is filtered by it.
--   * Every record has updated_at (ms epoch) for sync cursoring, and a
--     `deleted_at` tombstone column so deletes propagate during pull.
--   * JSON-shaped fields use TEXT and are validated server-side.

PRAGMA foreign_keys = ON;

-- ---------- identity / sessions ----------

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 100000,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  user_agent  TEXT,
  ip_hash     TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE invite_codes (
  code        TEXT PRIMARY KEY,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at     INTEGER,
  expires_at  INTEGER,
  note        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  meta       TEXT,
  ip_hash    TEXT,
  at         INTEGER NOT NULL
);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_at ON audit_log(at);

-- ---------- domain tables (mirror Dexie schema) ----------
-- Each row stores the user's IndexedDB primary key as `local_id` for back-reference,
-- but the canonical id is the TEXT uuid. Columns match the Dexie types in src/lib/db.ts.

CREATE TABLE compounds (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  default_dose    REAL NOT NULL,
  unit            TEXT NOT NULL,
  concentration   TEXT,
  schedule        TEXT NOT NULL,
  color           TEXT NOT NULL,
  ester           TEXT,
  half_life_days  REAL,
  peak_hours      REAL,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_compounds_user_updated ON compounds(user_id, updated_at);

CREATE TABLE injections (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  compound_id     TEXT NOT NULL,
  taken_at        TEXT NOT NULL,
  dose            REAL,
  unit            TEXT NOT NULL,
  route           TEXT NOT NULL,
  site            TEXT,
  notes           TEXT,
  raw_dose        TEXT,
  vial_amount     TEXT,
  weight_kg       REAL,
  protocol_dose_id TEXT,
  vial_id         TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_injections_user_updated ON injections(user_id, updated_at);

CREATE TABLE vitals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at     TEXT NOT NULL,
  systolic        INTEGER NOT NULL,
  diastolic       INTEGER NOT NULL,
  pulse           INTEGER,
  weight_kg       REAL,
  waist_cm        REAL,
  body_fat_pct    REAL,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_vitals_user_updated ON vitals(user_id, updated_at);

CREATE TABLE exams (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  collected_at    TEXT NOT NULL,
  exam_type       TEXT,
  location        TEXT,
  company         TEXT,
  lab_name        TEXT,
  source_file_id  TEXT,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_exams_user_updated ON exams(user_id, updated_at);

CREATE TABLE results (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id         TEXT NOT NULL,
  marker          TEXT NOT NULL,
  value           REAL,
  raw_value       TEXT NOT NULL,
  unit            TEXT,
  low             REAL,
  high            REAL,
  status          TEXT,
  notes           TEXT,
  source          TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_results_user_updated ON results(user_id, updated_at);
CREATE INDEX idx_results_exam ON results(exam_id);

-- Files: metadata-only here. Blob bytes live in R2 (added in a later phase).
CREATE TABLE files (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  size            INTEGER NOT NULL,
  added_at        TEXT NOT NULL,
  status          TEXT NOT NULL,
  extracted_text  TEXT,
  r2_key          TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_files_user_updated ON files(user_id, updated_at);

CREATE TABLE protocols (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  compound_id     TEXT NOT NULL,
  dose            REAL NOT NULL,
  unit            TEXT NOT NULL,
  cadence         TEXT NOT NULL,           -- JSON-encoded ProtocolCadence
  started_at      TEXT NOT NULL,
  ends_at         TEXT,
  notes           TEXT,
  phase           TEXT,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_protocols_user_updated ON protocols(user_id, updated_at);

CREATE TABLE protocol_doses (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protocol_id     TEXT NOT NULL,
  scheduled_at    TEXT NOT NULL,
  status          TEXT NOT NULL,
  injection_id    TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_protocol_doses_user_updated ON protocol_doses(user_id, updated_at);

CREATE TABLE vials (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  compound_id                 TEXT NOT NULL,
  label                       TEXT NOT NULL,
  total_ml                    REAL NOT NULL,
  concentration_mg_per_ml     REAL,
  remaining_ml                REAL NOT NULL,
  opened_at                   TEXT,
  expires_at                  TEXT,
  cost_cents                  INTEGER,
  archived                    INTEGER NOT NULL DEFAULT 0,
  created_at                  INTEGER NOT NULL,
  updated_at                  INTEGER NOT NULL,
  deleted_at                  INTEGER
);
CREATE INDEX idx_vials_user_updated ON vials(user_id, updated_at);

CREATE TABLE symptoms (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_at         TEXT NOT NULL,
  libido              INTEGER,
  sleep               INTEGER,
  mood                INTEGER,
  energy              INTEGER,
  water_retention     INTEGER,
  acne                INTEGER,
  nipple_sensitivity  INTEGER,
  joint_pain          INTEGER,
  headache            INTEGER,
  notes               TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  deleted_at          INTEGER
);
CREATE INDEX idx_symptoms_user_updated ON symptoms(user_id, updated_at);

CREATE TABLE marker_targets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marker          TEXT NOT NULL,
  low             REAL,
  high            REAL,
  unit            TEXT,
  rationale       TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER,
  UNIQUE(user_id, marker)
);
CREATE INDEX idx_marker_targets_user_updated ON marker_targets(user_id, updated_at);

CREATE TABLE goals (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  label           TEXT NOT NULL,
  target          REAL NOT NULL,
  marker          TEXT,
  started_at      TEXT NOT NULL,
  achieved_at     TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX idx_goals_user_updated ON goals(user_id, updated_at);

CREATE TABLE body_metrics (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_at     TEXT NOT NULL,
  source          TEXT NOT NULL,
  weight_kg       REAL,
  body_fat_pct    REAL,
  waist_cm        REAL,
  resting_hr      REAL,
  hrv_ms          REAL,
  sleep_hours     REAL,
  external_key    TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER,
  UNIQUE(user_id, external_key)
);
CREATE INDEX idx_body_metrics_user_updated ON body_metrics(user_id, updated_at);
