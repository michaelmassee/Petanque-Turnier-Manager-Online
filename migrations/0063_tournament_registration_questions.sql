-- Freie Checkbox-Fragen werden beim Turnier konfiguriert und die Antworten
-- pro Anmeldung gespeichert. Beide Werte sind JSON, damit bis zu zehn
-- unterschiedlich benannte Fragen ohne Schemaänderung verwaltet werden können.
ALTER TABLE tournaments ADD COLUMN registration_questions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE registrations ADD COLUMN registration_answers TEXT NOT NULL DEFAULT '[]';
