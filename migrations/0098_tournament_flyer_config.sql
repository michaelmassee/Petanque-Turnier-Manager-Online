-- Gespeicherte Gestaltung eines Turnier-Flyers. Erzeugte Dateien bleiben ausschließlich im Browser.
CREATE TABLE IF NOT EXISTS tournament_flyer_configs (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
