-- Vereine und Gruppen nutzen dieselbe Organisationsverwaltung. Spielorte sind
-- entweder Bouleplaetze (aussen) oder Boulehallen (innen).
ALTER TABLE clubs ADD COLUMN kind TEXT NOT NULL DEFAULT 'club' CHECK (kind IN ('club', 'group'));
ALTER TABLE boule_places ADD COLUMN venue_type TEXT NOT NULL DEFAULT 'outdoor' CHECK (venue_type IN ('outdoor', 'indoor'));
ALTER TABLE boule_places ADD COLUMN facility_codes TEXT NOT NULL DEFAULT '[]';

-- Aus historischen Mehrfachzuordnungen bleibt der aelteste Platz bei der
-- Organisation. Weitere Plaetze werden sicher zu eigenen Plaetzen des Owners.
UPDATE boule_places
SET reported_by_user_id = (SELECT owner_id FROM clubs WHERE clubs.id = boule_places.club_id)
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY club_id, venue_type ORDER BY created_at, id) AS position
    FROM boule_places
    WHERE club_id IS NOT NULL
  ) WHERE position > 1
);

UPDATE boule_places
SET club_id = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY club_id, venue_type ORDER BY created_at, id) AS position
    FROM boule_places
    WHERE club_id IS NOT NULL
  ) WHERE position > 1
);

CREATE UNIQUE INDEX idx_boule_places_one_venue_type_per_club
  ON boule_places(club_id, venue_type) WHERE club_id IS NOT NULL;
