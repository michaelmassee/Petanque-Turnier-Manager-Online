-- Eine abgelehnte Meldung ist weder eine Stornierung durch das Team noch eine aktive Anmeldung.
-- SQLite/D1 kann den Status-CHECK nicht direkt erweitern; deshalb wird die aktuelle Tabelle
-- vollständig und verlustfrei aufgebaut.
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'waitlist', 'rejected')),
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
  participation TEXT NOT NULL DEFAULT 'inactive' CHECK (participation IN ('inactive', 'active', 'withdrawn')),
  fee_selections TEXT NOT NULL DEFAULT '[]',
  organizer_message TEXT,
  registration_answers TEXT NOT NULL DEFAULT '[]',
  local_registration_uuid TEXT,
  registration_revision INTEGER NOT NULL DEFAULT 1,
  execution_revision INTEGER NOT NULL DEFAULT 1,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  partner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  partner2_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  over_capacity INTEGER NOT NULL DEFAULT 0,
  received_after_start INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'online',
  player_email TEXT,
  partner_club TEXT,
  partner2_club TEXT,
  live_token_hash TEXT,
  rejection_reason TEXT,
  rejected_at TEXT,
  rejected_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

INSERT INTO registrations_new (
  id, tournament_id, first_name, last_name, email, club, license_nr,
  partner_first_name, partner_last_name, partner_email, partner2_first_name, partner2_last_name, partner2_email,
  team_name, seeding_position, status, registered_at, confirmed_at, created_at, updated_at,
  language, reminder_sent_at, is_vip, partner_license_nr, partner2_license_nr, cancel_token, participation,
  fee_selections, organizer_message, registration_answers, local_registration_uuid, registration_revision, execution_revision,
  user_id, partner_user_id, partner2_user_id, over_capacity, received_after_start, origin, player_email,
  partner_club, partner2_club, live_token_hash
)
SELECT
  id, tournament_id, first_name, last_name, email, club, license_nr,
  partner_first_name, partner_last_name, partner_email, partner2_first_name, partner2_last_name, partner2_email,
  team_name, seeding_position, status, registered_at, confirmed_at, created_at, updated_at,
  language, reminder_sent_at, is_vip, partner_license_nr, partner2_license_nr, cancel_token, participation,
  fee_selections, organizer_message, registration_answers, local_registration_uuid, registration_revision, execution_revision,
  user_id, partner_user_id, partner2_user_id, over_capacity, received_after_start, origin, player_email,
  partner_club, partner2_club, live_token_hash
FROM registrations;

DROP TABLE registrations;
ALTER TABLE registrations_new RENAME TO registrations;

CREATE INDEX idx_registrations_email ON registrations(email);
CREATE INDEX idx_registrations_cancel_token ON registrations(cancel_token);
CREATE INDEX idx_registrations_tournament_status ON registrations(tournament_id, status);
CREATE INDEX idx_registrations_tournament_registered_at ON registrations(tournament_id, registered_at);
CREATE INDEX idx_registrations_tournament_status_registered_at ON registrations(tournament_id, status, registered_at);
CREATE INDEX idx_registrations_tournament_updated_at ON registrations(tournament_id, updated_at);
CREATE UNIQUE INDEX idx_registrations_document_local_uuid ON registrations(tournament_id, local_registration_uuid) WHERE local_registration_uuid IS NOT NULL;
CREATE INDEX idx_registrations_user ON registrations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_registrations_partner_user ON registrations(partner_user_id) WHERE partner_user_id IS NOT NULL;
CREATE INDEX idx_registrations_partner2_user ON registrations(partner2_user_id) WHERE partner2_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_registrations_live_token_hash ON registrations(live_token_hash) WHERE live_token_hash IS NOT NULL;
