ALTER TABLE postbox_messages ADD COLUMN broadcast_tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_postbox_messages_broadcast_tournament ON postbox_messages(broadcast_tournament_id);
