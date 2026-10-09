-- Vereinslogo des Spielorts wird beim Schreiben berechnet und am Turnier gespeichert, statt bei jedem Abruf der
-- Turnierliste pro Turnier alle Plätze/Vereine zu durchsuchen (sprengte das D1-Tageslimit für gelesene Zeilen).
-- Nur ADD COLUMN, VIEW und TRIGGER – kein Table-Rebuild.
ALTER TABLE tournaments ADD COLUMN venue_club_logo_url TEXT;

-- Einzige Definition der Logo-Regel: verknüpfter Platz → dessen Verein; sonst eindeutiger Verein mit Platz an
-- denselben Koordinaten bzw. (ohne Koordinaten) an derselben Adresse. Nur veröffentlichte Plätze/Vereine.
CREATE VIEW tournament_venue_club_logo AS
SELECT t.id AS tournament_id,
  COALESCE(
    (
      SELECT c.logo_url
      FROM boule_places p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = t.boule_place_id
        AND p.status = 'published'
        AND c.status = 'published'
    ),
    CASE
      WHEN t.boule_place_id IS NOT NULL THEN NULL
      WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL THEN (
        SELECT CASE WHEN COUNT(DISTINCT c.id) = 1 THEN MIN(c.logo_url) END
        FROM boule_places p
        JOIN clubs c ON c.id = p.club_id
        WHERE p.latitude = t.latitude
          AND p.longitude = t.longitude
          AND p.status = 'published'
          AND c.status = 'published'
      )
      ELSE (
        SELECT CASE WHEN COUNT(DISTINCT c.id) = 1 THEN MIN(c.logo_url) END
        FROM boule_places p
        JOIN clubs c ON c.id = p.club_id
        WHERE lower(trim(p.address)) = lower(trim(t.location))
          AND p.status = 'published'
          AND c.status = 'published'
      )
    END
  ) AS logo_url
FROM tournaments t;

-- Turnier angelegt oder Spielort geändert: nur dieses Turnier neu berechnen.
CREATE TRIGGER tournaments_venue_club_logo_insert
AFTER INSERT ON tournaments
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = NEW.id)
  WHERE id = NEW.id;
END;

CREATE TRIGGER tournaments_venue_club_logo_update
AFTER UPDATE OF boule_place_id, latitude, longitude, location ON tournaments
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = NEW.id)
  WHERE id = NEW.id;
END;

-- Platz oder Verein geändert (selten): alle Turniere neu berechnen, geschrieben werden nur geänderte Zeilen.
CREATE TRIGGER boule_places_venue_club_logo_insert
AFTER INSERT ON boule_places
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id)
  WHERE venue_club_logo_url IS NOT (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
END;

CREATE TRIGGER boule_places_venue_club_logo_update
AFTER UPDATE OF club_id, address, latitude, longitude, status ON boule_places
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id)
  WHERE venue_club_logo_url IS NOT (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
END;

CREATE TRIGGER boule_places_venue_club_logo_delete
AFTER DELETE ON boule_places
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id)
  WHERE venue_club_logo_url IS NOT (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
END;

CREATE TRIGGER clubs_venue_club_logo_update
AFTER UPDATE OF logo_url, status ON clubs
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id)
  WHERE venue_club_logo_url IS NOT (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
END;

CREATE TRIGGER clubs_venue_club_logo_delete
AFTER DELETE ON clubs
BEGIN
  UPDATE tournaments
  SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id)
  WHERE venue_club_logo_url IS NOT (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
END;

-- Bestehende Turniere einmalig befüllen.
UPDATE tournaments
SET venue_club_logo_url = (SELECT logo_url FROM tournament_venue_club_logo WHERE tournament_id = tournaments.id);
