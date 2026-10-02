-- Turnieranmeldung Stufe 2 und 3 (Spezifikation turnieranmeldung-ptmonline.md). Nur ADD COLUMN und neue Tabellen
-- (T-20): registrations und tournaments haben eingehende ON-DELETE-CASCADE-Fremdschlüssel und dürfen nie neu
-- aufgebaut werden.

-- Personen-Slots 1–3 sind die Spalten Spieler, Partner, Partner 2 (Formationsstärke höchstens 3, keine Ersatzspieler).
-- email bleibt die Kontakt-E-Mail der Anmeldung und verknüpft nie ein Konto (E-11); player_email ist die optionale
-- Slot-E-Mail der ersten Person (E-22). Bisher war email beides; der Backfill übernimmt sie als Slot-E-Mail, damit
-- bestehende Verknüpfungen nachvollziehbar bleiben.
ALTER TABLE registrations ADD COLUMN player_email TEXT;
UPDATE registrations SET player_email = email WHERE email NOT LIKE '%@ohne-email.invalid';

-- "Das bin ich nicht" (E-22): Das Konto wird aus dem Slot gelöst und nie wieder automatisch mit dieser Anmeldung verknüpft.
CREATE TABLE registration_link_declines (
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (registration_id, user_id)
);

-- Check-in-Nachricht genau einmal pro Anmeldung und Konto (E-09), auch wenn ein Konto erst später in den Slot kommt.
CREATE TABLE checkin_notifications (
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (registration_id, user_id)
);
INSERT OR IGNORE INTO checkin_notifications (registration_id, user_id, sent_at)
  SELECT id, user_id, live_link_sent_at FROM registrations WHERE live_link_sent_at IS NOT NULL AND user_id IS NOT NULL
  UNION ALL SELECT id, partner_user_id, live_link_sent_at FROM registrations WHERE live_link_sent_at IS NOT NULL AND partner_user_id IS NOT NULL
  UNION ALL SELECT id, partner2_user_id, live_link_sent_at FROM registrations WHERE live_link_sent_at IS NOT NULL AND partner2_user_id IS NOT NULL;

-- Doppelbelegung eines Kontos (KP-06 b): Die betroffene Person erhält pro Turnier genau eine Postbox-Nachricht.
CREATE TABLE account_conflict_notifications (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);

-- Check-in-Benachrichtigung pro Turnier abschaltbar (E-09), Aufbewahrungsfrist personenbezogener Daten (DS-04).
ALTER TABLE tournaments ADD COLUMN checkin_notification_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tournaments ADD COLUMN data_retention_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE tournaments ADD COLUMN personal_data_purged_at TEXT;
-- Zeitpunkt des letzten angenommenen Schreibauftrags des Dokuments: "Stand hh:mm" in der Live-Ansicht (KP-12).
ALTER TABLE tournaments ADD COLUMN last_sync_write_at TEXT;

-- Mêlée-Teamzuordnung aus der Mêlée-Übernahme in PTM (KP-18, T-18). Die Anmeldungen bleiben Einzelanmeldungen.
CREATE TABLE melee_team_assignments (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  team_uuid TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, registration_id)
);
CREATE INDEX idx_melee_team_assignments_team ON melee_team_assignments (tournament_id, team_uuid);

-- Löschnachweis (KP-07): PTM erhält tournament_deleted statt 404, verknüpfte Konten sehen einen Löschhinweis.
-- Bewusst ohne Fremdschlüssel; registrations_json enthält nur Anmeldungs- und Benutzer-IDs, keine Kontaktdaten.
CREATE TABLE tournament_tombstones (
  tournament_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  deleted_by_user_id TEXT,
  registrations_json TEXT NOT NULL DEFAULT '[]'
);
