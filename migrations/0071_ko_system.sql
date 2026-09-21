-- KO-System (Hauptprojekt-Referenz: ko/KoTurnierbaumSheet.java, CadrageRechner.java,
-- GruppenAufteilungRechner.java). ko_platz3 steuert das optionale Spiel um Platz 3
-- (Hauptprojekt-Default: aktiv). bracket_group ordnet Teams bei großen Feldern
-- (>16 Teams) einem unabhängigen Teilbaum zu (A/B/C...), NULL bei anderen Systemen.
-- match_index und stage_label sind generisch für alle Formate nutzbar, werden aber
-- aktuell nur vom KO-System befüllt (Winner-Advance-Rekonstruktion braucht eine
-- stabile Reihenfolge innerhalb einer Runde, die tournament_matches bisher nicht hatte).
ALTER TABLE tournaments ADD COLUMN ko_platz3 INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tournament_teams ADD COLUMN bracket_group TEXT;
ALTER TABLE tournament_matches ADD COLUMN match_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournament_matches ADD COLUMN stage_label TEXT;
