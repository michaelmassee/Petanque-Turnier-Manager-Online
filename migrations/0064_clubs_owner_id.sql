-- Vereine sollen wie Turniere einen "Owner" statt eines starren Erstellers haben,
-- damit Admins den Besitz übertragen können (siehe /api/tournaments/:id/owner).
ALTER TABLE clubs RENAME COLUMN created_by TO owner_id;
