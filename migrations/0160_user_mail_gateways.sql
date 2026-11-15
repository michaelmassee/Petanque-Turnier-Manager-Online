-- Eigenes E-Mail-Gateway je Konto (Zusatzoption): Ist es konfiguriert und aktiv, gehen alle Turnier-Mails des Kontos
-- ausschließlich darüber, ohne Ausweichen auf die Plattform-Gateways – auch bei mail-gesperrten Konten.
-- Das Geheimnis (SMTP-Passwort bzw. Resend-API-Key) liegt AES-GCM-verschlüsselt (Secret MAIL_GATEWAY_KEY) in secret_enc.
-- Neue Tabelle, kein Table-Rebuild (D1-Regel: eingehende ON-DELETE-CASCADE-Fremdschlüssel).
CREATE TABLE user_mail_gateways (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL CHECK (provider IN ('smtp', 'resend')),
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_security TEXT CHECK (smtp_security IS NULL OR smtp_security IN ('tls', 'starttls')),
  smtp_user TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  reply_to TEXT,
  secret_enc TEXT NOT NULL,
  -- Neu bei jedem Speichern: Statusänderungen eines Versands gelten nur für die Konfiguration, mit der er lief.
  config_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'ok', 'error')),
  last_error TEXT,
  last_error_at TEXT,
  last_success_at TEXT,
  last_test_at TEXT,
  -- Gesetzt, sobald der Besitzer wegen eines Fehlers im echten Versand eine Postfach-Nachricht bekommen hat;
  -- unabhängig vom Status, damit ein vorher fehlgeschlagener Test die Warnung nicht unterdrückt.
  failure_notified_at TEXT,
  updated_at TEXT NOT NULL
);

-- Versandstatistik: Mails über eigene Gateways der Turnierleitungen getrennt zählen.
ALTER TABLE email_delivery_daily ADD COLUMN organizer INTEGER NOT NULL DEFAULT 0;
