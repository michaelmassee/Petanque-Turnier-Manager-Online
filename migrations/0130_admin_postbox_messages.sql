-- Der Nachtbericht darf Nachrichten nicht durch das 25-Nachrichten-Limit der Postbox verlieren.
-- Kurzzeitkopie ohne FK auf die Postbox; Kontolöschung entfernt zugehörige Nachrichtenkopien.
CREATE TABLE admin_postbox_messages (
  message_id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_admin_postbox_messages_created ON admin_postbox_messages(created_at);

CREATE TRIGGER archive_admin_postbox_message
AFTER INSERT ON postbox_messages
WHEN NEW.kind = 'direct' AND NEW.broadcast_tournament_id IS NULL
  AND NEW.sender_id != NEW.recipient_id
  AND EXISTS (SELECT 1 FROM users WHERE id = NEW.recipient_id AND role = 'admin')
BEGIN
  INSERT INTO admin_postbox_messages (message_id, sender_id, recipient_id, body, created_at)
  VALUES (NEW.id, NEW.sender_id, NEW.recipient_id, NEW.body, NEW.created_at);
END;

-- Noch vorhandene Nachrichten erscheinen bereits im nächsten Bericht, ohne nachträgliche Einzelmails.
INSERT INTO admin_postbox_messages (message_id, sender_id, recipient_id, body, created_at)
SELECT m.id, m.sender_id, m.recipient_id, m.body, m.created_at
FROM postbox_messages m JOIN users u ON u.id = m.recipient_id
WHERE u.role = 'admin' AND m.kind = 'direct' AND m.broadcast_tournament_id IS NULL
  AND m.sender_id != m.recipient_id
  AND m.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days');
