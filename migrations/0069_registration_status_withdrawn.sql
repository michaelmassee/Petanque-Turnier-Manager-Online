-- Fuegt den Registration-Status 'withdrawn' hinzu (Turnierdokument hat den Teilnehmer waehrend
-- eines laufenden Turniers als ausgestiegen markiert). SQLite/D1 kann einen CHECK-Constraint nicht
-- direkt per ALTER TABLE aendern, daher Tabellen-Rebuild (Muster wie 0004/0006).
CREATE TABLE registrations_new (
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'waitlist', 'withdrawn')),
  registered_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de',
  reminder_sent_at TEXT,
  is_vip INTEGER NOT NULL DEFAULT 0,
  partner_license_nr TEXT,
  partner2_license_nr TEXT,
  cancel_token TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  fee_selections TEXT NOT NULL DEFAULT '[]',
  organizer_message TEXT,
  registration_answers TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

INSERT INTO registrations_new (
  id, tournament_id, first_name, last_name, email, club, license_nr,
  partner_first_name, partner_last_name, partner_email,
  partner2_first_name, partner2_last_name, partner2_email,
  team_name, seeding_position, status, registered_at, confirmed_at, created_at, updated_at,
  language, reminder_sent_at, is_vip, partner_license_nr, partner2_license_nr, cancel_token,
  active, fee_selections, organizer_message, registration_answers
)
SELECT
  id, tournament_id, first_name, last_name, email, club, license_nr,
  partner_first_name, partner_last_name, partner_email,
  partner2_first_name, partner2_last_name, partner2_email,
  team_name, seeding_position, status, registered_at, confirmed_at, created_at, updated_at,
  language, reminder_sent_at, is_vip, partner_license_nr, partner2_license_nr, cancel_token,
  active, fee_selections, organizer_message, registration_answers
FROM registrations;

DROP TABLE registrations;
ALTER TABLE registrations_new RENAME TO registrations;

CREATE INDEX IF NOT EXISTS idx_registrations_tournament_status ON registrations(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_cancel_token ON registrations(cancel_token);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament_registered_at ON registrations(tournament_id, registered_at);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament_status_registered_at ON registrations(tournament_id, status, registered_at);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament_updated_at ON registrations(tournament_id, updated_at);
