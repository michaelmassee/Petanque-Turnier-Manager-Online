-- Sieger der KO-Felder aus dem Turnierdokument (Maastrichter-Finalrunden A–H). Die Endrangliste hat dort zwei Teile:
-- die Vorrunden-Rangliste (desktop_ranking_json) und je Feld den KO-Sieger. Die veröffentlichte Endrangliste friert
-- beide ein. Nur ADD COLUMN, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE tournaments ADD COLUMN desktop_ko_winners_json TEXT;
ALTER TABLE tournament_final_rankings ADD COLUMN ko_winners_json TEXT;
