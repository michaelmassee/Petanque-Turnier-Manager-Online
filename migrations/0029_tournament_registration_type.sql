ALTER TABLE tournaments ADD COLUMN registration_type TEXT NOT NULL DEFAULT 'forme';
UPDATE tournaments SET registration_type = 'melee' WHERE type = 'supermelee';
