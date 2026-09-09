-- Repairs databases where the original report-system user was removed by the
-- unverified-account cleanup. The account is only a foreign-key owner and has
-- no usable password; marking it verified prevents that cleanup from removing
-- it again.
INSERT INTO users (
  id, email, role, password_salt, password_hash, created_at, updated_at,
  email_verified_at, first_name, last_name, mail_enabled
)
SELECT
  'system-tournament-reports',
  'system-tournament-reports@ptmonline.internal',
  'user',
  lower(hex(randomblob(16))),
  lower(hex(randomblob(32))),
  datetime('now'),
  datetime('now'),
  datetime('now'),
  'Turnier',
  'Meldungen (System)',
  0
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 'system-tournament-reports');

UPDATE users
SET email_verified_at = datetime('now')
WHERE id = 'system-tournament-reports' AND email_verified_at IS NULL;
