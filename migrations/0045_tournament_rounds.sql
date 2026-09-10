-- Grundgerüst für die Online-Durchführung von Turnieren (Runden/Matches/Ergebnisse).
-- Bewusst systemneutral benannt (kein "supermelee_*"), da neben Supermêlée künftig
-- weitere Spielsysteme (z.B. Schweizer System) dieselben Tabellen nutzen sollen.
-- Teams werden nicht als eigene Entität gespeichert, da sie bei Supermêlée jede
-- Runde neu gebildet werden - die Spieler-IDs pro Team-Seite reichen als JSON-Array.

CREATE TABLE tournament_rounds (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_tournament_rounds_unique ON tournament_rounds(tournament_id, round_number);

CREATE TABLE tournament_matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  team_a_registration_ids TEXT NOT NULL,
  team_b_registration_ids TEXT NOT NULL,
  score_a INTEGER,
  score_b INTEGER,
  no_show TEXT CHECK (no_show IN ('a', 'b')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES tournament_rounds(id) ON DELETE CASCADE
);

CREATE INDEX idx_tournament_matches_round ON tournament_matches(round_id);
CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id);
