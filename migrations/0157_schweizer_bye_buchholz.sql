-- Freilos-Buchholz im Schweizer System wie im Hauptprojekt (Issue #38, 03_Schweizer.md 5.1):
-- 'null' = BPV-Regel, ein Freilos liefert 0 BHZ/FBHZ; 'neutral' = fiktiver Durchschnittsgegner.
-- Bestehende Turniere bleiben bei 'null'; neu angelegte (und kopierte) Turniere setzen beim Anlegen 'neutral'.
ALTER TABLE tournaments ADD COLUMN schweizer_bye_buchholz TEXT NOT NULL DEFAULT 'null';
