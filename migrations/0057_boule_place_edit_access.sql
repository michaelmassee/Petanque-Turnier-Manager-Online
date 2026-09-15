-- Ermöglicht das nachträgliche Bearbeiten von Bouleplätzen ohne Verein (öffentlich
-- über "Bouleplatz melden" eingereicht): reported_by_user_id verknüpft den Platz mit
-- dem meldenden Konto (falls eingeloggt gemeldet), edit_token erlaubt anonymen Meldern
-- den späteren Zugriff über einen dauerhaften Link (analog zu registrations.cancel_token).
ALTER TABLE boule_places ADD COLUMN reported_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE boule_places ADD COLUMN edit_token TEXT;

CREATE INDEX idx_boule_places_reported_by ON boule_places(reported_by_user_id);
CREATE UNIQUE INDEX idx_boule_places_edit_token ON boule_places(edit_token);
