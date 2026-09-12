-- Persistente Teams sind für Schweizer nötig: Anders als Supermêlée bleiben sie
-- über alle Runden gleich und tragen Freilos- und Paarungshistorie.
ALTER TABLE tournaments ADD COLUMN schweizer_ranking_mode TEXT NOT NULL DEFAULT 'mit_buchholz'
  CHECK (schweizer_ranking_mode IN ('mit_buchholz', 'ohne_buchholz'));

CREATE TABLE tournament_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  member_registration_ids TEXT NOT NULL,
  seed_position INTEGER NOT NULL DEFAULT 0,
  had_bye INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);
CREATE INDEX idx_tournament_teams_tournament ON tournament_teams(tournament_id);

ALTER TABLE tournament_matches ADD COLUMN team_a_id TEXT;
ALTER TABLE tournament_matches ADD COLUMN team_b_id TEXT;
