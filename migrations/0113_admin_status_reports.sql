-- Pro Administrator und täglichem Cron-Zeitfenster nur einmal in die Mail-Queue einreihen.
-- Keine Berichtsinhalte oder zusätzlichen E-Mail-Adressen dauerhaft speichern.
CREATE TABLE admin_status_reports (
  report_day TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  queued_at TEXT NOT NULL,
  PRIMARY KEY (report_day, user_id)
);

-- Empfängersuche liest nur verifizierte Admins statt täglich alle Benutzerkonten.
-- Normale Konten erzeugen in diesem partiellen Index keine Einträge.
CREATE INDEX idx_users_admin_status_recipients ON users(id)
WHERE role = 'admin' AND email_verified_at IS NOT NULL;
