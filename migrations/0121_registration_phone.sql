-- Telefonnummer bei der Anmeldung (Abgleich petanque-online.de, Entscheidung vom 2026-10-21): eine Kontaktnummer pro
-- Anmeldung, immer abgefragt; die Turnierleitung legt pro Turnier fest, ob sie optional (Standard) oder Pflicht ist.
-- Nur für die Turnierleitung sichtbar und Teil der automatischen Datenlöschung.
-- Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN phone_required INTEGER NOT NULL DEFAULT 0 CHECK (phone_required IN (0, 1));
ALTER TABLE registrations ADD COLUMN phone TEXT;
