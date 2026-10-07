-- Eindeutiger Benutzername (@handle), damit gleichnamige Nutzer unterscheidbar sind. Bestandskonten erhalten ihn per
-- scripts/backfill-usernames.mjs. Nur ADD COLUMN und neue Tabellen, kein Table-Rebuild von users.
ALTER TABLE users ADD COLUMN username TEXT;
-- Letzte eigene Änderung (Sperrfrist 30 Tage); Registrierung und Admin-Änderungen setzen es nicht.
ALTER TABLE users ADD COLUMN username_changed_at TEXT;
-- NULL: automatisch vergeben (OAuth-Neukonto, Backfill) und vom Nutzer noch nicht bestätigt.
ALTER TABLE users ADD COLUMN username_confirmed_at TEXT;

CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Von Admins entfernte Namen dürfen nicht erneut vergeben werden. created_by bewusst ohne Fremdschlüssel.
CREATE TABLE blocked_usernames (
  username TEXT PRIMARY KEY,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE username_reports (
  id TEXT PRIMARY KEY,
  reported_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_username TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_username_reports_status ON username_reports(status, created_at);
CREATE INDEX idx_username_reports_reporter ON username_reports(reporter_id, created_at);
CREATE UNIQUE INDEX idx_username_reports_open_pair ON username_reports(reported_user_id, reporter_id) WHERE status = 'open';
