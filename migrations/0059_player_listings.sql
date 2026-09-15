-- Spielerbörse: Gesuche für Turniere (mit festem Termin) oder regelmäßiges
-- Training (ohne Termin, kein automatischer Ablauf). Ein gemeinsames Table
-- mit type-Diskriminator statt zweier Tabellen, da Listen-/Such-/
-- Kartendarstellung für beide Typen identisch ist.
CREATE TABLE player_listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('tournament', 'training')),
  title TEXT NOT NULL,
  description TEXT,
  location_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  event_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_player_listings_user ON player_listings(user_id);
CREATE INDEX idx_player_listings_type ON player_listings(type);
CREATE INDEX idx_player_listings_event_date ON player_listings(event_date);
