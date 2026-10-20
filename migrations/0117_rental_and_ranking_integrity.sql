-- Spielortbezogene Belegungsabfragen nutzen den vorhandenen Reservierungsindex je Angebot/Datum.
CREATE INDEX idx_rental_offers_place ON rental_offers(boule_place_id);

-- Alle Statuspfade (Web, Start, Reset und Dokument-Sync) nehmen eine alte Veröffentlichung atomar zurück.
-- Der Snapshot bleibt liegen (unsichtbar ohne final_ranking_published_at, beim nächsten Veröffentlichen überschrieben),
-- damit mailed_at erhalten bleibt und ein erneuter Versand weiter bestätigt werden muss.
CREATE TRIGGER clear_final_ranking_on_reopen
AFTER UPDATE OF status ON tournaments
WHEN NEW.status <> 'finished' AND NEW.final_ranking_published_at IS NOT NULL
BEGIN
  UPDATE tournaments SET final_ranking_published_at = NULL WHERE id = NEW.id;
END;

-- Bereits vor dieser Migration wieder geöffnete Turniere dürfen beim nächsten Abschluss keinen Snapshot reaktivieren.
UPDATE tournaments SET final_ranking_published_at = NULL
WHERE status <> 'finished' AND final_ranking_published_at IS NOT NULL;

-- Angebotsänderungen und Reservierungsanlage dürfen sich nicht zwischen Vorabprüfung und Schreiben überholen.
-- Mindest-/Höchstdauer gelten nur für neue Buchungen und sind daher nicht geschützt.
-- updated_at ist der vom Worker gesetzte Zeitpunkt dieser Änderung, auch in Tests mit festgelegter Uhrzeit.
CREATE TRIGGER protect_reserved_rental_offer
BEFORE UPDATE ON rental_offers
WHEN EXISTS (
  SELECT 1 FROM rental_reservations r
  WHERE r.offer_id = OLD.id AND r.status IN ('requested', 'confirmed') AND r.end_utc > NEW.updated_at
    AND (NEW.boule_place_id <> OLD.boule_place_id OR NEW.timezone <> OLD.timezone
      OR (NEW.lane_count < OLD.lane_count AND NEW.lane_count < (
        SELECT SUM(occupied.lanes) FROM rental_reservations occupied
        WHERE occupied.offer_id = OLD.id AND occupied.status IN ('requested', 'confirmed')
          AND occupied.start_utc <= r.start_utc AND occupied.end_utc > r.start_utc
      )))
)
BEGIN
  SELECT RAISE(ABORT, 'rental_reservations_conflict');
END;

CREATE TRIGGER protect_reserved_rental_opening_update
BEFORE UPDATE ON rental_opening_hours
WHEN EXISTS (
  SELECT 1 FROM rental_reservations r JOIN rental_offers o ON o.id = r.offer_id
  WHERE r.offer_id = OLD.offer_id AND r.status IN ('requested', 'confirmed') AND r.end_utc > o.updated_at
    AND CAST(strftime('%w', r.local_date) AS INTEGER) = OLD.weekday
    AND (NEW.weekday <> OLD.weekday OR NEW.offer_id <> OLD.offer_id
      OR r.start_hour < NEW.open_hour OR r.start_hour + r.hours > NEW.close_hour)
)
BEGIN
  SELECT RAISE(ABORT, 'rental_reservations_conflict');
END;

CREATE TRIGGER protect_reserved_rental_opening_delete
BEFORE DELETE ON rental_opening_hours
WHEN EXISTS (
  SELECT 1 FROM rental_reservations r JOIN rental_offers o ON o.id = r.offer_id
  WHERE r.offer_id = OLD.offer_id AND r.status IN ('requested', 'confirmed') AND r.end_utc > o.updated_at
    AND CAST(strftime('%w', r.local_date) AS INTEGER) = OLD.weekday
)
BEGIN
  SELECT RAISE(ABORT, 'rental_reservations_conflict');
END;
