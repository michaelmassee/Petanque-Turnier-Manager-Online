-- Hotfix zu 0161: tournaments hatte damit 98 Spalten; getTournamentById liest tournaments.* plus drei Unterabfragen,
-- D1 erlaubt höchstens 100 Spalten je Ergebnis ("too many columns in result set") – jede Turnierabfrage scheiterte.
-- Die KO-Sieger aus dem Turnierdokument stehen deshalb in einer eigenen Tabelle. Neue Turnierdaten nie mehr als
-- Spalte an tournaments hängen (Gate: worker.tournament-columns.test.js).
CREATE TABLE IF NOT EXISTS tournament_document_ko_winners (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  winners_json TEXT NOT NULL
);
INSERT OR REPLACE INTO tournament_document_ko_winners (tournament_id, winners_json)
  SELECT id, desktop_ko_winners_json FROM tournaments WHERE desktop_ko_winners_json IS NOT NULL;
ALTER TABLE tournaments DROP COLUMN desktop_ko_winners_json;
