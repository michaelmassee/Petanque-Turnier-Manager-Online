-- Teilnehmer-Limit pro Turnier (Missbrauchsschutz, 2026-10-30): höchstens so viele Meldungen (pending, confirmed,
-- waitlist) nimmt ein Turnier dieses Besitzers an. Pro Benutzer in der Benutzerverwaltung einstellbar; Turniere von
-- Admins sind ausgenommen, wie beim Turnier-Limit.
ALTER TABLE users ADD COLUMN participant_limit INTEGER NOT NULL DEFAULT 70;
