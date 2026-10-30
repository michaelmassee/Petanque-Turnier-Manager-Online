-- Teilnehmer-Limit in der Datenbank: Wechselt eine Meldung von nicht belegend (z. B. cancelled) auf belegend (pending,
-- confirmed, waitlist), während das Limit des Turnierbesitzers erreicht ist, bricht die Änderung ab. RAISE(ABORT) rollt
-- den ganzen D1-Batch zurück - ein Sync-Auftrag mit einer blockierten Wiederaufnahme speichert also nichts halb.
-- Turniere von Admins sind unbegrenzt (Limit NULL, die Bedingung ist dann nicht erfüllt).
CREATE TRIGGER IF NOT EXISTS registrations_participant_limit_guard
BEFORE UPDATE OF status ON registrations
WHEN OLD.status NOT IN ('pending', 'confirmed', 'waitlist')
  AND NEW.status IN ('pending', 'confirmed', 'waitlist')
  AND (SELECT COUNT(*) FROM registrations WHERE tournament_id = NEW.tournament_id AND status IN ('pending', 'confirmed', 'waitlist'))
    >= (SELECT CASE WHEN u.role = 'admin' THEN NULL ELSE u.participant_limit END
          FROM tournaments t JOIN users u ON u.id = t.owner_id WHERE t.id = NEW.tournament_id)
BEGIN
  SELECT RAISE(ABORT, 'participant_limit_reached');
END;
