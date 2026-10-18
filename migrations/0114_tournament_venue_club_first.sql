-- Passt eine Turnieradresse zu mehreren Plätzen, gewinnt zuerst ein Vereinsplatz,
-- erst danach ein Platz ohne Verein. Nur Views neu anlegen; Trigger aus 0109
-- lesen die View beim Ausführen und bleiben unverändert.
DROP VIEW tournament_venue_club_logo;
DROP VIEW tournament_venue_place;

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
      COALESCE(c.name, p.club_name) IS NULL,
      COALESCE(c.name, p.club_name) COLLATE NOCASE,
      p.name COLLATE NOCASE, p.id
    LIMIT 1
  )) AS place_id
FROM tournaments t;

CREATE VIEW tournament_venue_club_logo AS
SELECT v.tournament_id, c.logo_url AS logo_url
FROM tournament_venue_place v
LEFT JOIN boule_places p ON p.id = v.place_id AND p.status = 'published'
LEFT JOIN clubs c ON c.id = p.club_id AND c.status = 'published';
