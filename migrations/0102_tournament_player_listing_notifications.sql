-- Opt-in für Push-Hinweise bei neuen Mitspielgesuchen eines Turniers.
-- Pro Konto und Turnier existiert höchstens ein Abo; der Turnierindex hält
-- den Versand beim Anlegen eines Gesuchs auf die tatsächlichen Abonnenten klein.
CREATE TABLE IF NOT EXISTS tournament_player_listing_notifications (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_player_listing_notifications_tournament
  ON tournament_player_listing_notifications(tournament_id);
