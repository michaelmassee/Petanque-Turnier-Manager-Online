-- Ergebnismeldung durch Spieler: Die Meldung steht sofort in der Partie, erscheint auf Turnierseite, Rangliste und in den
-- Live-Ansichten aber erst, wenn die Turnierleitung sie mit „Gesehen“ bestätigt, das Ergebnis selbst speichert oder die
-- nächste Runde startet. Nach Turnierende gelten offene Meldungen als bestätigt. Bestehende Partien: 0 (bestätigt).
ALTER TABLE tournament_matches ADD COLUMN result_report_pending INTEGER NOT NULL DEFAULT 0;
