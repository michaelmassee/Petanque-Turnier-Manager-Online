-- Regelmäßige Belegungen eines Mietangebots (z. B. wöchentliches Vereinstraining): an einem Wochentag sind von–bis
-- so viele Bahnen (NULL = alle des Angebots) nicht mietbar, optional nur zwischen valid_from und valid_to (YYYY-MM-DD).
-- Nur eine neue Tabelle, kein Umbau bestehender (D1-Regel: keine Table-Rebuilds).
CREATE TABLE rental_blocks (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES rental_offers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour INTEGER NOT NULL CHECK (end_hour BETWEEN 1 AND 24 AND end_hour > start_hour),
  lanes INTEGER CHECK (lanes IS NULL OR lanes >= 1),
  label TEXT,
  valid_from TEXT,
  valid_to TEXT
);
CREATE INDEX idx_rental_blocks_offer ON rental_blocks(offer_id);
