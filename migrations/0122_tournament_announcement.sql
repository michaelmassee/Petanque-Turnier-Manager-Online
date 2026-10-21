-- Ankündigung der Turnierleitung (Abgleich petanque-online.de, Entscheidung vom 2026-10-21): ein aktueller Hinweis
-- wie „Mittagspause bis 13 Uhr“, sichtbar als Banner in der Live-Ansicht und auf der Turnierseite, bis er gelöscht
-- oder das Turnier abgeschlossen wird. Liegt am Turnier, damit der Live-Abruf ohne zusätzliche Abfrage auskommt.
-- Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN announcement TEXT;
ALTER TABLE tournaments ADD COLUMN announcement_at TEXT;
