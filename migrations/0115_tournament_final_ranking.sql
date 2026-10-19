-- Veröffentlichte Endrangliste eines online durchgeführten Turniers: einmal berechneter Snapshot, damit Aufrufe aus
-- der Teilnehmer-Mail keine Matches mehr lesen und spätere Korrekturen die versendete Liste nicht still ändern.
-- Der Snapshot liegt in einer eigenen Tabelle: Turnierlisten lesen tournaments.* und sollen ihn nicht mitparsen.
ALTER TABLE tournaments ADD COLUMN final_ranking_published_at TEXT;

CREATE TABLE tournament_final_rankings (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  ranking_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  mailed_at TEXT
);
