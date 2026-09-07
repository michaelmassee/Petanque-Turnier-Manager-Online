CREATE TABLE IF NOT EXISTS postbox_messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'system')),
  body TEXT,
  event_type TEXT,
  event_data TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  CHECK ((kind = 'direct' AND sender_id IS NOT NULL AND body IS NOT NULL) OR kind = 'system')
);
CREATE INDEX IF NOT EXISTS idx_postbox_messages_recipient_created ON postbox_messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_postbox_messages_conversation ON postbox_messages(sender_id, recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
