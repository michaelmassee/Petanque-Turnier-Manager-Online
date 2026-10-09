-- Indizes für „meine Anmeldungen“ (Postbox-Polling, Live-Ansicht) und den Admin-Zähler unbestätigter Konten,
-- die sonst bei jedem Aufruf registrations bzw. users komplett lesen. Nur CREATE INDEX.
CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_partner_user ON registrations(partner_user_id) WHERE partner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_partner2_user ON registrations(partner2_user_id) WHERE partner2_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_unverified ON users(email_verified_at) WHERE email_verified_at IS NULL;
