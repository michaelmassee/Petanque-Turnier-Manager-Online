-- Vereins-, Plätze- und Mietangebotsliste liegen im Cloudflare-Cache unter einem Schlüssel mit dieser Version.
-- Jede Änderung an den Quelldaten erhöht sie per Trigger, egal ob über die API, die Admin-Seiten oder ein
-- Import-Skript. Damit bauen alle Rechenzentren die Listen nach einer Änderung sofort neu auf, sonst nie
-- (cache.delete wirkt nur im eigenen Rechenzentrum).
-- Nur CREATE TABLE/INDEX/TRIGGER – kein Table-Rebuild.
CREATE TABLE IF NOT EXISTS cache_versions (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO cache_versions (name, version) VALUES ('places', 0);

CREATE TRIGGER IF NOT EXISTS clubs_places_cache_insert AFTER INSERT ON clubs
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS clubs_places_cache_update AFTER UPDATE ON clubs
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS clubs_places_cache_delete AFTER DELETE ON clubs
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;

CREATE TRIGGER IF NOT EXISTS boule_places_places_cache_insert AFTER INSERT ON boule_places
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS boule_places_places_cache_update AFTER UPDATE ON boule_places
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS boule_places_places_cache_delete AFTER DELETE ON boule_places
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;

-- Die Plätzeliste enthält die Like-Zahl je Platz.
CREATE TRIGGER IF NOT EXISTS boule_place_likes_places_cache_insert AFTER INSERT ON boule_place_likes
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS boule_place_likes_places_cache_delete AFTER DELETE ON boule_place_likes
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;

-- clubOwnedByAdmin hängt an der Rolle des Vereinsbesitzers.
CREATE TRIGGER IF NOT EXISTS users_places_cache_role AFTER UPDATE OF role ON users
WHEN OLD.role IS NOT NEW.role
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;

CREATE TRIGGER IF NOT EXISTS rental_offers_places_cache_insert AFTER INSERT ON rental_offers
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS rental_offers_places_cache_update AFTER UPDATE ON rental_offers
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;
CREATE TRIGGER IF NOT EXISTS rental_offers_places_cache_delete AFTER DELETE ON rental_offers
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'places'; END;

-- Für GET /api/places/personal (persönliche Markierungen der angemeldeten Person).
CREATE INDEX IF NOT EXISTS idx_boule_place_likes_user ON boule_place_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_clubs_owner ON clubs(owner_id);
