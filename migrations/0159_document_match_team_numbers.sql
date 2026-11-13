-- Teamnummern der Partien aus dem Turnierdokument (Nr. der Meldeliste im Hauptprojekt). Verbundene Turniere haben
-- keine festen Online-Teams und keine Online-Teamnummern; ohne diese Spalten zeigen Live-Ansicht und Turnierseite
-- dort keine Nummer. Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournament_matches ADD COLUMN team_a_number INTEGER;
ALTER TABLE tournament_matches ADD COLUMN team_b_number INTEGER;
