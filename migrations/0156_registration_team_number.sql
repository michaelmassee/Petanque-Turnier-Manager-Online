-- Feste Teamnummer einer Formée-Meldung wie die Nr. der Meldeliste im Hauptprojekt. Nur bei online durchgeführten
-- Turnieren vergeben und gültig; bei einem mit dem Turnierdokument verbundenen Turnier gilt die Nummer des Dokuments.
ALTER TABLE registrations ADD COLUMN team_number INTEGER;
