-- Trennt die zwei Zustaende einer Meldung sauber:
--   status        = Anmeldestatus (pending/confirmed/waitlist/cancelled), online verwaltet
--   participation = Teilnahme nach dem Check-in (inactive/active/withdrawn), analog zur
--                   Aktiv-Spalte der Meldeliste im Hauptprojekt (leer / 1 / 2)
-- Ersetzt die boolesche Spalte `active` (konnte inaktiv und ausgesetzt nicht unterscheiden) und
-- entfernt 'withdrawn' aus dem Anmeldestatus (0069). Tabellen-Rebuild, da SQLite/D1 CHECK-Constraints
-- nicht per ALTER TABLE aendern kann (Muster wie 0069).
-- Default 'active' erhaelt das bisherige Verhalten rein online durchgefuehrter Turniere (neue und
-- per Schnelleingabe erfasste Meldungen spielen sofort mit); das Turnierdokument meldet die
-- Teilnahme bei jedem Rundenstart ohnehin explizit.
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'waitlist')),
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
  participation TEXT NOT NULL DEFAULT 'active' CHECK (participation IN ('inactive', 'active', 'withdrawn')),
  fee_selections TEXT NOT NULL DEFAULT '[]',
  organizer_message TEXT,
  registration_answers TEXT NOT NULL DEFAULT '[]',
  local_registration_uuid TEXT,
  registration_revision INTEGER NOT NULL DEFAULT 1,
  execution_revision INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

INSERT INTO registrations_new (
  id, tournament_id, first_name, last_name, email, club, license_nr,
  partner_first_name, partner_last_name, partner_email,
  partner2_first_name, partner2_last_name, partner2_email,
  team_name, seeding_position, status, registered_at, confirmed_at, created_at, updated_at,
  language, reminder_sent_at, is_vip, partner_license_nr, partner2_license_nr, cancel_token,
  participation, fee_selections, organizer_message, registration_answers,
  local_registration_uuid, registration_revision, execution_revision
)
SELECT
  id, tournament_id, first_name, last_name, email, club, license_nr,
  partner_first_name, partner_last_name, partner_email,
  partner2_first_name, partner2_last_name, partner2_email,
  team_name, seeding_position,
  CASE WHEN status = 'withdrawn' THEN 'confirmed' ELSE status END,
  registered_at, confirmed_at, created_at, updated_at,
  language, reminder_sent_at, is_vip, partner_license_nr, partner2_license_nr, cancel_token,
  CASE WHEN status = 'withdrawn' THEN 'withdrawn' WHEN active = 1 THEN 'active' ELSE 'inactive' END,
  fee_selections, organizer_message, registration_answers,
  local_registration_uuid, registration_revision, execution_revision
FROM registrations;

DROP TABLE registrations;
ALTER TABLE registrations_new RENAME TO registrations;

CREATE INDEX IF NOT EXISTS idx_registrations_tournament_status ON registrations(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_cancel_token ON registrations(cancel_token);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament_registered_at ON registrations(tournament_id, registered_at);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament_status_registered_at ON registrations(tournament_id, status, registered_at);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament_updated_at ON registrations(tournament_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_document_local_uuid
  ON registrations(tournament_id, local_registration_uuid)
  WHERE local_registration_uuid IS NOT NULL;
