-- Eigene Cache-Version für die Vereinsliste (GET /api/clubs): Sie zeigt nur Name und Platzkoordinaten veröffentlichter
-- Vereine, muss also bei Likes, Mietangeboten, Rollenwechseln, Beschreibungen oder Logos nicht in allen
-- Rechenzentren neu aufgebaut werden. Die Version 'places' bleibt für Plätze- und Angebotsliste unverändert.
-- Nur INSERT/CREATE TRIGGER – kein Table-Rebuild.
INSERT OR IGNORE INTO cache_versions (name, version) VALUES ('clubs', 0);

CREATE TRIGGER IF NOT EXISTS clubs_clubs_cache_insert AFTER INSERT ON clubs
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'clubs'; END;
CREATE TRIGGER IF NOT EXISTS clubs_clubs_cache_update AFTER UPDATE OF id, name, status ON clubs
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'clubs'; END;
CREATE TRIGGER IF NOT EXISTS clubs_clubs_cache_delete AFTER DELETE ON clubs
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'clubs'; END;

CREATE TRIGGER IF NOT EXISTS boule_places_clubs_cache_insert AFTER INSERT ON boule_places
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'clubs'; END;
CREATE TRIGGER IF NOT EXISTS boule_places_clubs_cache_update AFTER UPDATE OF club_id, status, latitude, longitude ON boule_places
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'clubs'; END;
CREATE TRIGGER IF NOT EXISTS boule_places_clubs_cache_delete AFTER DELETE ON boule_places
BEGIN UPDATE cache_versions SET version = version + 1 WHERE name = 'clubs'; END;
