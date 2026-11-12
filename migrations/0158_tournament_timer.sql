-- Rundenzeit-Timer der Turnierleitung (wie der Timer im PTM-Hauptprojekt): JSON mit Zustand, Endzeit bzw. Restzeit bei
-- Pause und den zuletzt benutzten Einstellungen. Liegt am Turnier, damit Live-Ansicht und Turnierseite ihn ohne
-- zusätzliche Abfrage mitbekommen; die Seiten zählen anhand der Endzeit selbst herunter.
-- Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN timer TEXT;
