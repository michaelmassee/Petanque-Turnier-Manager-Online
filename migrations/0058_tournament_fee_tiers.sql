-- Tarife bleiben als JSON beim Turnier, damit ein Tarifwechsel nicht die
-- historische Auswahl einer bereits gespeicherten Anmeldung verändert.
ALTER TABLE tournaments ADD COLUMN fee_tiers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE registrations ADD COLUMN fee_selections TEXT NOT NULL DEFAULT '[]';

-- Das bisherige einzelne Startgeld wird zu einem weiterhin kompatiblen
-- Standardtarif. Turniere ohne Startgeld bleiben ausdrücklich tariflos.
UPDATE tournaments
SET fee_tiers = '[{"id":"legacy-standard","name":"Startgeld","amountCents":' || entry_fee_cents || ',"active":true}]'
WHERE entry_fee_cents > 0;
