-- Turnieroption Spielbahn wie im Hauptprojekt (SpielrundeSpielbahn): X = keine Bahn (nur laufende Nr.),
-- L = leere Spalte (Bahn händisch je Partie), N = durchnummeriert 1..n, R = zufällig 1..n. Freilose bekommen keine Bahn.
-- Gilt für jede neu ausgeloste Runde; bestehende Runden bleiben unverändert.
ALTER TABLE tournaments ADD COLUMN court_mode TEXT NOT NULL DEFAULT 'X';
