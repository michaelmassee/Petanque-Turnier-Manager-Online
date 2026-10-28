-- Veranstalterzuordnung unabhängig vom Spielort; Listen lesen nur gespeicherte Logos.
ALTER TABLE tournaments ADD COLUMN organizer_club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;
ALTER TABLE tournaments ADD COLUMN organizer_club_logo_url TEXT;
CREATE INDEX idx_tournaments_organizer_club ON tournaments(organizer_club_id);

CREATE VIEW tournament_organizer_club AS
SELECT t.id AS tournament_id, COALESCE(t.organizer_club_id,
  (SELECT c.id FROM clubs c WHERE c.status = 'published' AND lower(trim(c.name)) = lower(trim(t.club)))) AS club_id
FROM tournaments t;

CREATE TRIGGER tournaments_organizer_insert AFTER INSERT ON tournaments
BEGIN
  UPDATE tournaments SET
    organizer_club_id = (SELECT club_id FROM tournament_organizer_club WHERE tournament_id = NEW.id),
    organizer_club_logo_url = (SELECT c.logo_url FROM clubs c WHERE c.status = 'published' AND c.id =
      (SELECT club_id FROM tournament_organizer_club WHERE tournament_id = NEW.id))
  WHERE id = NEW.id;
END;

CREATE TRIGGER tournaments_organizer_update AFTER UPDATE OF club, organizer_club_id ON tournaments
WHEN NEW.club IS NOT OLD.club OR NEW.organizer_club_id IS NOT OLD.organizer_club_id
BEGIN
  UPDATE tournaments SET
    organizer_club_id = COALESCE(CASE WHEN NEW.club IS OLD.club OR NEW.organizer_club_id IS NOT OLD.organizer_club_id THEN NEW.organizer_club_id END,
      (SELECT id FROM clubs WHERE status = 'published' AND lower(trim(name)) = lower(trim(NEW.club)))),
    organizer_club_logo_url = NULL
  WHERE id = NEW.id;
  UPDATE tournaments SET organizer_club_logo_url =
    (SELECT logo_url FROM clubs WHERE id = tournaments.organizer_club_id AND status = 'published')
  WHERE id = NEW.id;
END;

CREATE TRIGGER clubs_organizer_insert AFTER INSERT ON clubs WHEN NEW.status = 'published'
BEGIN
  UPDATE tournaments SET organizer_club_id = NEW.id WHERE organizer_club_id IS NULL AND lower(trim(club)) = lower(trim(NEW.name));
END;
CREATE TRIGGER clubs_organizer_update AFTER UPDATE OF name, logo_url, status ON clubs
BEGIN
  UPDATE tournaments SET organizer_club_id = NEW.id WHERE organizer_club_id IS NULL AND NEW.status = 'published' AND lower(trim(club)) = lower(trim(NEW.name));
  UPDATE tournaments SET organizer_club_logo_url = CASE WHEN NEW.status = 'published' THEN NEW.logo_url END
  WHERE organizer_club_id = NEW.id;
END;

-- Keine Änderung an Orten, Koordinaten oder expliziten Turnierlogos.
UPDATE tournaments SET organizer_club_id = (SELECT club_id FROM tournament_organizer_club WHERE tournament_id = tournaments.id);
