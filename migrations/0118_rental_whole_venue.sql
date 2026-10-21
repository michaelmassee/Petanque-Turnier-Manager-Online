-- Platz mieten: Ein Angebot vermietet einzelne Bahnen (lanes), nur komplett (whole: ganze Halle bzw. ganzer Platz)
-- oder beides (both), optional mit eigenem Komplettpreis. Eine Komplettbuchung belegt alle Bahnen des Angebots
-- (lanes = lane_count zum Anfragezeitpunkt) und ist mit whole = 1 markiert.
-- Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE rental_offers ADD COLUMN rental_mode TEXT NOT NULL DEFAULT 'lanes' CHECK (rental_mode IN ('lanes', 'whole', 'both'));
ALTER TABLE rental_offers ADD COLUMN whole_price_minor INTEGER CHECK (whole_price_minor IS NULL OR whole_price_minor >= 0);
ALTER TABLE rental_offers ADD COLUMN whole_price_note TEXT;
ALTER TABLE rental_reservations ADD COLUMN whole INTEGER NOT NULL DEFAULT 0 CHECK (whole IN (0, 1));
