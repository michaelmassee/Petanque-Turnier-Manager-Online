-- Wer ein Ergebnis über die Live-Ansicht gemeldet hat (Anmeldungs-ID), damit die Turnierleitung
-- Spielermeldungen deutlich erkennt. NULL = von der Turnierleitung eingetragen.
ALTER TABLE tournament_matches ADD COLUMN result_reported_by TEXT;
