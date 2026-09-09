-- Reservierter System-Account als tournaments.created_by fuer oeffentlich gemeldete
-- Turniere ("Turnier melden"). manager_id bleibt bei diesen Turnieren NULL, da kein
-- eingeloggter Turnierleiter beteiligt ist; created_by ist aber NOT NULL mit FK auf
-- users, daher dieser feste Platzhalter-Account.
-- Nicht login-faehig: zufaelliger Passwort-Hash ohne bekanntes Klartext-Passwort.
-- Der Account ist dennoch als verifiziert markiert, damit die Bereinigung
-- unbestaetigter Nutzer ihn nicht samt aller referenzierenden Turniere loescht.
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
