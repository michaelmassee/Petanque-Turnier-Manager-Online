-- Ein Spielort für Platz-ID und Vereinslogo. Nur beim Schreiben auflösen;
-- Turnierlisten lesen weiterhin die gespeicherten Werte ohne Platzsuche.
CREATE INDEX idx_boule_places_published_address
ON boule_places(lower(trim(address))) WHERE status = 'published';
CREATE INDEX idx_boule_places_published_coordinates
ON boule_places(latitude, longitude) WHERE status = 'published';
CREATE INDEX idx_tournaments_unlinked_address
ON tournaments(lower(trim(location))) WHERE boule_place_id IS NULL;

CREATE VIEW tournament_venue_place AS
SELECT t.id AS tournament_id,
  COALESCE(t.boule_place_id, (
    SELECT p.id FROM boule_places p
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE p.status = 'published'
      AND (p.club_id IS NULL OR c.status = 'published')
      AND (
        (t.latitude IS NOT NULL AND t.longitude IS NOT NULL AND p.latitude = t.latitude AND p.longitude = t.longitude)
        OR (trim(t.location) != '' AND lower(trim(p.address)) = lower(trim(t.location)))
      )
    ORDER BY
      COALESCE(c.name, p.club_name) COLLATE NOCASE,
      p.name COLLATE NOCASE, p.id
    LIMIT 1
  )) AS place_id
FROM tournaments t;

-- Die vorhandenen Logo-Trigger verwenden jetzt denselben Spielort wie der Link.
DROP VIEW tournament_venue_club_logo;
CREATE VIEW tournament_venue_club_logo AS
SELECT v.tournament_id, c.logo_url AS logo_url
FROM tournament_venue_place v
LEFT JOIN boule_places p ON p.id = v.place_id AND p.status = 'published'
LEFT JOIN clubs c ON c.id = p.club_id AND c.status = 'published';

CREATE TRIGGER tournaments_place_address_insert
AFTER INSERT ON tournaments
WHEN NEW.boule_place_id IS NULL
BEGIN
  UPDATE tournaments
  SET boule_place_id = (SELECT place_id FROM tournament_venue_place WHERE tournament_id = NEW.id)
  WHERE id = NEW.id AND boule_place_id IS NULL
    AND (SELECT place_id FROM tournament_venue_place WHERE tournament_id = NEW.id) IS NOT NULL;
END;

CREATE TRIGGER tournaments_place_address_update
AFTER UPDATE OF location, latitude, longitude, boule_place_id ON tournaments
WHEN NEW.boule_place_id IS NULL
BEGIN
  UPDATE tournaments
  SET boule_place_id = (SELECT place_id FROM tournament_venue_place WHERE tournament_id = NEW.id)
  WHERE id = NEW.id AND boule_place_id IS NULL
    AND (SELECT place_id FROM tournament_venue_place WHERE tournament_id = NEW.id) IS NOT NULL;
END;

CREATE TRIGGER boule_places_tournament_address_insert
AFTER INSERT ON boule_places
WHEN NEW.status = 'published'
BEGIN
  UPDATE tournaments
  SET boule_place_id = (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id)
  WHERE boule_place_id IS NULL
    AND (lower(trim(location)) = lower(trim(NEW.address)) OR (latitude = NEW.latitude AND longitude = NEW.longitude))
    AND (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id) IS NOT NULL;
END;

CREATE TRIGGER boule_places_tournament_address_update
AFTER UPDATE OF address, latitude, longitude, status, club_id ON boule_places
WHEN NEW.status = 'published'
BEGIN
  UPDATE tournaments
  SET boule_place_id = (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id)
  WHERE boule_place_id IS NULL
    AND (lower(trim(location)) = lower(trim(NEW.address)) OR (latitude = NEW.latitude AND longitude = NEW.longitude))
    AND (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id) IS NOT NULL;
END;

CREATE TRIGGER clubs_tournament_address_publish
AFTER UPDATE OF status ON clubs
WHEN NEW.status = 'published' AND OLD.status != 'published'
BEGIN
  UPDATE tournaments
  SET boule_place_id = (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id)
  WHERE boule_place_id IS NULL
    AND (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id) IS NOT NULL;
END;

-- Vorhandene Turniere nachtragen und gespeicherte Logos auf dieselbe Regel bringen.
UPDATE tournaments
SET boule_place_id = (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id)
WHERE boule_place_id IS NULL
  AND (SELECT place_id FROM tournament_venue_place WHERE tournament_id = tournaments.id) IS NOT NULL;

UPDATE tournaments
SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id)
WHERE venue_club_logo_url IS NOT (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
