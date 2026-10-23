-- Platz mieten: Anzahl Personen je Reservierungsanfrage (Pflicht bei neuen Anfragen), etwa für Preise pro Person.
-- Ältere Reservierungen bleiben ohne Angabe (NULL). Nur ADD COLUMN, kein Table-Rebuild (D1-Regel).
ALTER TABLE rental_reservations ADD COLUMN persons INTEGER CHECK (persons IS NULL OR persons BETWEEN 1 AND 500);
