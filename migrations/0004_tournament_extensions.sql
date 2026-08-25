-- Rebuilds tournaments to widen the formation CHECK constraint (SQLite/D1 cannot
-- ALTER a CHECK constraint in place) and adds region + participants_public.
CREATE TABLE tournaments_new (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  manager_id TEXT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  location TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (
    type IN (
      'formule_x',
      'jeder_gegen_jeden',
      'ko',
      'kaskaden',
      'liga',
      'maastrichter',
      'poule_ab',
      'schweizer',
      'supermelee',
      'trip_tete'
    )
  ),
  formation TEXT NOT NULL CHECK (formation IN ('tete', 'doublette', 'triplette', 'doublette_mixed', 'triplette_mixed')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'registration', 'running', 'finished')),
  max_registrations INTEGER NOT NULL DEFAULT 0,
  registration_deadline TEXT,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  internal_notes TEXT,
  region TEXT,
  participants_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO tournaments_new (
  id, created_by, manager_id, name, date, start_time, location, description, type, formation, status,
  max_registrations, registration_deadline, entry_fee_cents, contact_name, contact_email, contact_phone,
  visibility, internal_notes, region, participants_public, created_at, updated_at
)
SELECT
  id, created_by, manager_id, name, date, start_time, location, description, type, formation, status,
  max_registrations, registration_deadline, entry_fee_cents, contact_name, contact_email, contact_phone,
  visibility, internal_notes, NULL, 0, created_at, updated_at
FROM tournaments;

DROP TABLE tournaments;
ALTER TABLE tournaments_new RENAME TO tournaments;

CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(date);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_visibility ON tournaments(visibility);
CREATE INDEX IF NOT EXISTS idx_tournaments_manager_id ON tournaments(manager_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_region ON tournaments(region);
