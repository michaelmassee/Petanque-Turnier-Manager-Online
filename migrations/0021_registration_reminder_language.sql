ALTER TABLE registrations ADD COLUMN language TEXT NOT NULL DEFAULT 'de';
ALTER TABLE registrations ADD COLUMN reminder_sent_at TEXT;
