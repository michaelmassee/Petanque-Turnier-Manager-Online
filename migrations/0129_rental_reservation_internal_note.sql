-- Platz mieten: interne Notiz je Reservierung (Rich Text), nur für Verwalter des Angebots sichtbar und jederzeit
-- bearbeitbar. Nur ADD COLUMN, kein Table-Rebuild (D1-Regel).
ALTER TABLE rental_reservations ADD COLUMN internal_note TEXT;
