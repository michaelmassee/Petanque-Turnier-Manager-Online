-- Optionaler Verweis eines Mitspielgesuchs auf ein Turnier aus der Liste.
-- Nur ADD COLUMN (kein Table-Rebuild); wird das Turnier gelöscht, bleibt das
-- Gesuch ohne Verweis bestehen.
ALTER TABLE player_listings ADD COLUMN tournament_id TEXT REFERENCES tournaments(id) ON DELETE SET NULL;
-- Standardmäßig verschwindet ein verknüpftes Gesuch, sobald das Turnier beendet
-- ist (stündlicher Cron); der Ersteller kann das pro Gesuch abschalten.
ALTER TABLE player_listings ADD COLUMN delete_when_tournament_finished INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_player_listings_tournament ON player_listings(tournament_id);
