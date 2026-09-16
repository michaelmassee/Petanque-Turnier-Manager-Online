-- Spielposition eines Mitspielgesuchs. Der Default erhält bestehende Gesuche
-- als flexibel spielbar und macht die Erweiterung rückwärtskompatibel.
ALTER TABLE player_listings ADD COLUMN playing_position TEXT NOT NULL DEFAULT 'egal'
  CHECK (playing_position IN ('leger', 'milieu', 'schiesser', 'egal'));
CREATE INDEX idx_player_listings_playing_position ON player_listings(playing_position);
