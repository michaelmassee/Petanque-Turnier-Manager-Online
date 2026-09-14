-- Gespeicherte Suchen: Nutzer können ihre aktuelle Kombination aus Freitextsuche,
-- Filtern und Umkreissuche auf der Turnierfinder-Startseite als benanntes Paket
-- speichern (max. 25 pro Nutzer, serverseitig durchgesetzt) und optional eine
-- Benachrichtigung aktivieren, sobald neue passende Turniere veröffentlicht werden.
--
-- last_checked_at startet bewusst als NULL statt "jetzt": der erste Cron-Lauf nach
-- dem Anlegen setzt ihn auf "jetzt", verschickt aber keine Benachrichtigung, sonst
-- würden alle bereits bestehenden passenden Turniere fälschlich als "neu" gemeldet.
CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT,
  only_mine INTEGER NOT NULL DEFAULT 0,
  filter_month TEXT,
  filter_formation TEXT,
  filter_registration_type TEXT,
  filter_type TEXT,
  filter_open_only INTEGER NOT NULL DEFAULT 0,
  origin_lat REAL,
  origin_lng REAL,
  origin_label TEXT,
  radius_km TEXT,
  notify_enabled INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
CREATE INDEX idx_saved_searches_notify ON saved_searches(notify_enabled) WHERE notify_enabled = 1;
