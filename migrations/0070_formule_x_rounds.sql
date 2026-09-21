-- Formule X (Hauptprojekt-Default: 4 Runden, konfigurierbar) - bestimmt, wann das
-- Turnier als abgeschlossen gilt (siehe lib/pairing/formulex.js), nicht den
-- Siegaufschlag (der hängt von den bisher gespielten Runden ab, nicht der
-- konfigurierten Gesamtzahl).
ALTER TABLE tournaments ADD COLUMN formule_x_rounds INTEGER NOT NULL DEFAULT 4 CHECK (formule_x_rounds BETWEEN 1 AND 20);
