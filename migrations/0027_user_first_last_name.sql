-- Splits users.name into first_name/last_name without rebuilding the table
-- (DROP TABLE + rename would cascade-delete tournaments/registrations via
-- their ON DELETE CASCADE foreign keys to users). SQLite/D1 supports
-- ALTER TABLE ... DROP COLUMN directly (3.35+), so no rebuild is needed.
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

UPDATE users
SET first_name = CASE WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), 1, instr(trim(name), ' ') - 1) ELSE trim(name) END,
    last_name = CASE WHEN instr(trim(name), ' ') > 0 THEN trim(substr(trim(name), instr(trim(name), ' ') + 1)) ELSE '' END;

ALTER TABLE users DROP COLUMN name;
