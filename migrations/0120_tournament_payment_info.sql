-- Zahlungshinweise zum Startgeld (Abgleich petanque-online.de, Entscheidung vom 2026-10-21): freies Textfeld statt
-- IBAN-Maske, damit es international passt (IBAN, PayPal, Twint, Bizum, Tikkie, „bar am Turniertag“ …). Erscheint auf
-- der Turnierseite und in Bestätigungs-, Eingangs- und Erinnerungsmail.
-- Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN payment_info TEXT;
