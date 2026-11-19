-- Maastrichter online spielbar: Schweizer Vorrunden, danach K.O. in Finalgruppen (lib/pairing/maastrichter.js).
-- Einstellungen in eigener Tabelle, weil tournaments am D1-Limit von 100 Ergebnisspalten steht (siehe 0162).
-- Nur CREATE TABLE/ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
CREATE TABLE IF NOT EXISTS tournament_maastrichter_settings (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  preliminary_rounds INTEGER NOT NULL DEFAULT 3 CHECK (preliminary_rounds BETWEEN 1 AND 10),
  group_mode TEXT NOT NULL DEFAULT 'NACH_GROESSE' CHECK (group_mode IN ('NACH_GROESSE', 'NACH_SIEGEN'))
);
-- Setzrang in der Finalgruppe (Platz in der Vorrunden-Rangliste innerhalb der Gruppe), beim Übergang einmal gesetzt.
ALTER TABLE tournament_teams ADD COLUMN ko_seed INTEGER;
