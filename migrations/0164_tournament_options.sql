-- Turnieroptionen in eigener Tabelle: tournaments steht am D1-Limit von 100 Ergebnisspalten (siehe 0162).
-- Fehlende Zeile = alle Optionen auf Standard, daher kein Backfill. Neue Optionen als weitere Spalte hier, nie an tournaments.
-- Nur CREATE TABLE/ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
CREATE TABLE IF NOT EXISTS tournament_options (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  -- Ergebnismeldungen von Spielern erst nach Bestätigung durch die Turnierleitung öffentlich (E-27). Standard: sofort.
  result_report_confirmation_required INTEGER NOT NULL DEFAULT 0
);
