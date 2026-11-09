-- Weitere Turnieroptionen wie im Hauptprojekt (Konfiguration je Turniersystem), Standardwerte = Hauptprojekt bzw.
-- bisheriges festes Verhalten online:
--   bye_points_for/against          Freispiel Punkte + / - (Schweizer, Jeder gegen Jeden, Formule X), 13:7
--   missed_round_points_for/against Nicht gespielte Runde + / - Punkte (Supermêlée), 0:13
--   ko_group_size/ko_min_last_group_size  Turnierbaum Gruppengröße / Mindestgröße letzte Gruppe (K.O.), 16 / 4
--   ko_court_first_round_only       Spielbaum Bahn nur Runde 1 (K.O.), an
--   team_display_round/ranking      Team-Anzeige in Spielrunde/Rangliste: NR, SPIELERNAMEN, NAME (online bisher NAME)
--   round_robin_return              Rückrunde (Jeder gegen Jeden), aus
ALTER TABLE tournaments ADD COLUMN bye_points_for INTEGER NOT NULL DEFAULT 13;
ALTER TABLE tournaments ADD COLUMN bye_points_against INTEGER NOT NULL DEFAULT 7;
ALTER TABLE tournaments ADD COLUMN missed_round_points_for INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN missed_round_points_against INTEGER NOT NULL DEFAULT 13;
ALTER TABLE tournaments ADD COLUMN ko_group_size INTEGER NOT NULL DEFAULT 16;
ALTER TABLE tournaments ADD COLUMN ko_min_last_group_size INTEGER NOT NULL DEFAULT 4;
ALTER TABLE tournaments ADD COLUMN ko_court_first_round_only INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tournaments ADD COLUMN team_display_round TEXT NOT NULL DEFAULT 'NAME';
ALTER TABLE tournaments ADD COLUMN team_display_ranking TEXT NOT NULL DEFAULT 'NAME';
ALTER TABLE tournaments ADD COLUMN round_robin_return INTEGER NOT NULL DEFAULT 0;
