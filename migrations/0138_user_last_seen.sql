-- „Zuletzt online“ für die Admin-Benutzerliste. Gesetzt bei der Anmeldung und bei der stündlichen
-- Sitzungsverlängerung (requireSession), also auf etwa eine Stunde genau, ohne zusätzliche Lesezugriffe.
-- Nur ADD COLUMN – kein Table-Rebuild (users hat eingehende ON-DELETE-CASCADE-Fremdschlüssel).
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- Nachtrag aus vorhandenen Daten: letzte Anmeldung bzw. letzte Verlängerung einer noch gespeicherten Sitzung
-- (Ablauf minus 14 Tage Sitzungsdauer, siehe SESSION_TTL_SECONDS).
UPDATE users SET last_seen_at = NULLIF(MAX(
  COALESCE(last_login_at, ''),
  COALESCE((SELECT strftime('%Y-%m-%dT%H:%M:%fZ', MAX(sessions.expires_at), '-14 days') FROM sessions WHERE sessions.user_id = users.id), '')
), '');
