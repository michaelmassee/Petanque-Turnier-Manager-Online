-- Fester QR-Schlüssel pro Turnier: Der Anmelde-QR-Code zeigt dauerhaft auf /q/<qr_token>, der Server leitet
-- auf das aktuelle Ziel weiter. Wird einmalig erzeugt und nie geändert. Nur ADD COLUMN + Index.
ALTER TABLE tournaments ADD COLUMN qr_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_qr_token ON tournaments(qr_token) WHERE qr_token IS NOT NULL;
