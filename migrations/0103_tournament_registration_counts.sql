-- Anzahl aktiver Meldungen und Wartelistenplätze wird beim Schreiben am Turnier gespeichert, statt bei jedem Abruf
-- der Turnierliste pro Turnier in registrations zu zählen (D1-Tageslimit für gelesene Zeilen).
-- Nur ADD COLUMN und TRIGGER – kein Table-Rebuild. Achtung: Ein künftiger Rebuild von registrations
-- (wie in 0102) verwirft diese Trigger und muss sie neu anlegen.
ALTER TABLE tournaments ADD COLUMN active_registrations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN waitlist_registrations INTEGER NOT NULL DEFAULT 0;

UPDATE tournaments
SET active_registrations = (
    SELECT COUNT(*) FROM registrations
    WHERE registrations.tournament_id = tournaments.id AND registrations.status IN ('pending', 'confirmed')
  ),
  waitlist_registrations = (
    SELECT COUNT(*) FROM registrations
    WHERE registrations.tournament_id = tournaments.id AND registrations.status = 'waitlist'
  );

CREATE TRIGGER registrations_counts_insert
AFTER INSERT ON registrations
BEGIN
  UPDATE tournaments
  SET active_registrations = (
      SELECT COUNT(*) FROM registrations
      WHERE registrations.tournament_id = NEW.tournament_id AND registrations.status IN ('pending', 'confirmed')
    ),
    waitlist_registrations = (
      SELECT COUNT(*) FROM registrations
      WHERE registrations.tournament_id = NEW.tournament_id AND registrations.status = 'waitlist'
    )
  WHERE id = NEW.tournament_id;
END;

CREATE TRIGGER registrations_counts_delete
AFTER DELETE ON registrations
BEGIN
  UPDATE tournaments
  SET active_registrations = (
      SELECT COUNT(*) FROM registrations
      WHERE registrations.tournament_id = OLD.tournament_id AND registrations.status IN ('pending', 'confirmed')
    ),
    waitlist_registrations = (
      SELECT COUNT(*) FROM registrations
      WHERE registrations.tournament_id = OLD.tournament_id AND registrations.status = 'waitlist'
    )
  WHERE id = OLD.tournament_id;
END;

-- Statuswechsel (bestätigen, stornieren, ablehnen, Warteliste nachrücken) oder Umhängen auf ein anderes Turnier:
-- altes und neues Turnier neu zählen.
CREATE TRIGGER registrations_counts_update
AFTER UPDATE OF status, tournament_id ON registrations
BEGIN
  UPDATE tournaments
  SET active_registrations = (
      SELECT COUNT(*) FROM registrations
      WHERE registrations.tournament_id = tournaments.id AND registrations.status IN ('pending', 'confirmed')
    ),
    waitlist_registrations = (
      SELECT COUNT(*) FROM registrations
      WHERE registrations.tournament_id = tournaments.id AND registrations.status = 'waitlist'
    )
  WHERE id IN (OLD.tournament_id, NEW.tournament_id);
END;
