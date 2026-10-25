ALTER TABLE users ADD COLUMN postbox_read_retention_days INTEGER NOT NULL DEFAULT 7
  CHECK (typeof(postbox_read_retention_days) = 'integer' AND postbox_read_retention_days BETWEEN 1 AND 365);

-- Inhalt einmal speichern, Zustellung und ersten Lesezeitpunkt pro Konto führen.
CREATE TABLE postbox_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL REFERENCES postbox_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (message_id, user_id)
);
CREATE INDEX idx_postbox_entries_user_created ON postbox_entries(user_id, created_at DESC, id DESC);
CREATE INDEX idx_postbox_entries_read ON postbox_entries(read_at) WHERE read_at IS NOT NULL;

-- Nur Nachrichten anfassen, deren persönliche Kopie gerade entfernt wurde.
CREATE TABLE postbox_orphan_candidates (
  message_id TEXT PRIMARY KEY REFERENCES postbox_messages(id) ON DELETE CASCADE
);
CREATE TRIGGER postbox_entry_removed AFTER DELETE ON postbox_entries
BEGIN
  INSERT OR IGNORE INTO postbox_orphan_candidates (message_id)
    SELECT OLD.message_id WHERE EXISTS (SELECT 1 FROM postbox_messages WHERE id = OLD.message_id);
END;
CREATE TRIGGER postbox_entry_limit AFTER INSERT ON postbox_entries
BEGIN
  DELETE FROM postbox_entries WHERE id IN (
    SELECT id FROM postbox_entries WHERE user_id = NEW.user_id
    ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 25
  );
END;

-- Nur direkte Empfänger haben einen verlässlichen bisherigen Lesenachweis.
-- Für Rundnachrichten wurde read_at bisher zwischen allen Teilnehmern geteilt.
INSERT OR IGNORE INTO postbox_entries (message_id, user_id, created_at, read_at)
SELECT m.id, targets.user_id, m.created_at,
  CASE WHEN m.broadcast_tournament_id IS NULL AND m.recipient_id = targets.user_id THEN m.read_at ELSE NULL END
FROM (
  SELECT id AS message_id, recipient_id AS user_id FROM postbox_messages
  UNION SELECT id, sender_id FROM postbox_messages WHERE sender_id IS NOT NULL
    AND (event_type IS NOT 'admin_group_message' OR json_extract(event_data, '$.senderCopy') = 1)
  UNION SELECT m.id, r.user_id FROM postbox_messages m JOIN registrations r ON r.tournament_id = m.broadcast_tournament_id
    WHERE r.status IN ('pending', 'confirmed', 'waitlist') AND r.user_id IS NOT NULL
  UNION SELECT m.id, r.partner_user_id FROM postbox_messages m JOIN registrations r ON r.tournament_id = m.broadcast_tournament_id
    WHERE r.status IN ('pending', 'confirmed', 'waitlist') AND r.partner_user_id IS NOT NULL
  UNION SELECT m.id, r.partner2_user_id FROM postbox_messages m JOIN registrations r ON r.tournament_id = m.broadcast_tournament_id
    WHERE r.status IN ('pending', 'confirmed', 'waitlist') AND r.partner2_user_id IS NOT NULL
) targets JOIN postbox_messages m ON m.id = targets.message_id
ORDER BY m.created_at, m.id;

DELETE FROM postbox_messages WHERE id IN (SELECT message_id FROM postbox_orphan_candidates)
  AND NOT EXISTS (SELECT 1 FROM postbox_entries WHERE message_id = postbox_messages.id);
DELETE FROM postbox_orphan_candidates;

-- Alle Versandwege (auch Bulk-Systemmeldungen und Endranglisten) sind atomar abgedeckt.
CREATE TRIGGER deliver_postbox_message AFTER INSERT ON postbox_messages
BEGIN
  INSERT OR IGNORE INTO postbox_entries (message_id, user_id, created_at, read_at)
  SELECT NEW.id, targets.user_id, NEW.created_at,
    CASE WHEN NEW.broadcast_tournament_id IS NULL AND NEW.recipient_id = targets.user_id THEN NEW.read_at ELSE NULL END
  FROM (
    SELECT NEW.recipient_id AS user_id
    UNION SELECT NEW.sender_id WHERE NEW.sender_id IS NOT NULL
      AND (NEW.event_type IS NOT 'admin_group_message' OR json_extract(NEW.event_data, '$.senderCopy') = 1)
    UNION SELECT r.user_id FROM registrations r WHERE r.tournament_id = NEW.broadcast_tournament_id
      AND r.status IN ('pending', 'confirmed', 'waitlist') AND r.user_id IS NOT NULL
    UNION SELECT r.partner_user_id FROM registrations r WHERE r.tournament_id = NEW.broadcast_tournament_id
      AND r.status IN ('pending', 'confirmed', 'waitlist') AND r.partner_user_id IS NOT NULL
    UNION SELECT r.partner2_user_id FROM registrations r WHERE r.tournament_id = NEW.broadcast_tournament_id
      AND r.status IN ('pending', 'confirmed', 'waitlist') AND r.partner2_user_id IS NOT NULL
  ) targets;
  -- Erst nach vollständigem Fan-out: eine andere persönliche Kopie kann den Inhalt noch benötigen.
  DELETE FROM postbox_messages WHERE id IN (SELECT message_id FROM postbox_orphan_candidates)
    AND NOT EXISTS (SELECT 1 FROM postbox_entries WHERE message_id = postbox_messages.id);
  DELETE FROM postbox_orphan_candidates;
END;
