-- Der ursprüngliche Vereinsfilter speicherte kurzzeitig den Vereinsnamen.
-- Für die räumliche Suche wird die stabile Vereins-ID benötigt.
UPDATE saved_searches
SET filter_club = (
  SELECT id FROM clubs WHERE lower(trim(name)) = lower(trim(saved_searches.filter_club)) LIMIT 1
)
WHERE filter_club <> ''
  AND filter_club NOT IN (SELECT id FROM clubs);
