-- Das anmeldende Konto ist nicht zwingend selbst ein Teammitglied. Es darf daher
-- seine eigene Meldung auch dann stornieren, wenn die Kontaktadresse zu einer
-- anderen Person gehört.
ALTER TABLE registrations ADD COLUMN registrant_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Bestehende Meldungen hatten nur die Kontaktadresse als Storno-Berechtigung.
-- Diese bekannte Zuordnung bleibt bei einer späteren E-Mail-Änderung erhalten.
UPDATE registrations
SET registrant_user_id = (
  SELECT users.id FROM users
  WHERE lower(users.email) = lower(registrations.email)
)
WHERE registrant_user_id IS NULL;

CREATE INDEX idx_registrations_registrant_user_id
  ON registrations(registrant_user_id);
