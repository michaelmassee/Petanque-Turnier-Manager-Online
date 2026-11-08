-- Schlüssel für die Bildschirm-Anzeige der Turnierseite: Die Turnierleitung teilt den Link, er öffnet Spielplan,
-- Rangliste und Anzeige ohne Anmeldung und ohne veröffentlichte Teilnehmerliste. Getrennt vom Freigabe-Link privater
-- Turniere, damit er keine Anmeldung und keine QR-Weiterleitung freischaltet.
ALTER TABLE tournaments ADD COLUMN display_token TEXT;
