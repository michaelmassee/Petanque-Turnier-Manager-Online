-- Tatsächlicher Turnierstart (Online-Start oder erster Start aus dem Turnierdokument). Die Turnierseite/Anzeige fragt
-- bis 8 Stunden danach von selbst ab; der geplante Beginn reicht nicht, wenn später als angesetzt gestartet wird.
-- Nur ADD COLUMN, kein Rebuild.
ALTER TABLE tournaments ADD COLUMN started_at TEXT;
