-- Freigabe-Link privater Turniere wiederverwendbar: Teilen liefert immer denselben Link, nur
-- "Freigabe-Link deaktivieren" macht ihn ungültig. Bisher stand nur der Hash in der Tabelle, sodass
-- jedes Teilen einen neuen Schlüssel erzeugen musste und ältere Links ungültig wurden.
-- Der Schlüssel gewährt nur Lesezugriff auf das Turnier, das in derselben Datenbank ohnehin steht.
ALTER TABLE tournament_share_links ADD COLUMN token TEXT;
