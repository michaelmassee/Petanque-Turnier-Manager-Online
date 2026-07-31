CREATE TABLE IF NOT EXISTS tournaments (
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
  formation TEXT NOT NULL CHECK (formation IN ('tete', 'doublette', 'triplette')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'registration', 'running', 'finished')),
  max_registrations INTEGER NOT NULL DEFAULT 0,
  registration_deadline TEXT,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  internal_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(date);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_visibility ON tournaments(visibility);
CREATE INDEX IF NOT EXISTS idx_tournaments_manager_id ON tournaments(manager_id);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  club TEXT,
  license_nr TEXT,
  partner_first_name TEXT,
  partner_last_name TEXT,
  partner_email TEXT,
  partner2_first_name TEXT,
  partner2_last_name TEXT,
  partner2_email TEXT,
  team_name TEXT,
  seeding_position INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'waitlist')),
  registered_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registrations_tournament_status ON registrations(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
