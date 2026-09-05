ALTER TABLE registrations ADD COLUMN cancel_token TEXT;
CREATE INDEX IF NOT EXISTS idx_registrations_cancel_token ON registrations(cancel_token);
