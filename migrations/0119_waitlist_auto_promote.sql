-- Automatisches Nachrücken aus der Warteliste (Abgleich petanque-online.de, Entscheidung vom 2026-10-21): Wird ein
-- Platz frei, rückt der Erste der Warteliste bis zum Turnierstart automatisch nach. Standard für neue und bestehende
-- Turniere ist automatisch; die Turnierleitung kann es pro Turnier abschalten.
-- Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN waitlist_auto_promote INTEGER NOT NULL DEFAULT 1 CHECK (waitlist_auto_promote IN (0, 1));
