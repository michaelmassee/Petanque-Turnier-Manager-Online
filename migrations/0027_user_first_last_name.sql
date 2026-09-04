-- Splits users.name into first_name/last_name. SQLite/D1 cannot DROP a column
-- or add a NOT NULL column without a default pre-3.35, so rebuild the table.
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'turnierleiter')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  email_verified_at TEXT,
  password_change_required INTEGER NOT NULL DEFAULT 0,
  pending_email TEXT,
  tournament_limit INTEGER NOT NULL DEFAULT 5,
  language TEXT NOT NULL DEFAULT 'de',
  license_nr TEXT
);

INSERT INTO users_new (
  id, first_name, last_name, email, role, password_salt, password_hash,
  created_at, updated_at, email_verified_at, password_change_required,
  pending_email, tournament_limit, language, license_nr
)
SELECT
  id,
  CASE WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), 1, instr(trim(name), ' ') - 1) ELSE trim(name) END,
  CASE WHEN instr(trim(name), ' ') > 0 THEN trim(substr(trim(name), instr(trim(name), ' ') + 1)) ELSE '' END,
  email, role, password_salt, password_hash, created_at, updated_at,
  email_verified_at, password_change_required, pending_email, tournament_limit,
  language, license_nr
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
