-- Nachrichten an die Admin-Gruppe erreichen auch einen Admin als Absender selbst; diese Kopie gehört ebenfalls in
-- seinen Nachtbericht. 0130 ist bereits angewendet, deshalb wird der Trigger hier ersetzt (keine Tabelle neu aufgebaut).
DROP TRIGGER IF EXISTS archive_admin_postbox_message;

CREATE TRIGGER archive_admin_postbox_message
AFTER INSERT ON postbox_messages
WHEN NEW.kind = 'direct' AND NEW.broadcast_tournament_id IS NULL
  AND (NEW.sender_id != NEW.recipient_id OR NEW.event_type = 'admin_group_message')
  AND EXISTS (SELECT 1 FROM users WHERE id = NEW.recipient_id AND role = 'admin')
BEGIN
  INSERT INTO admin_postbox_messages (message_id, sender_id, recipient_id, body, created_at)
  VALUES (NEW.id, NEW.sender_id, NEW.recipient_id, NEW.body, NEW.created_at);
END;
