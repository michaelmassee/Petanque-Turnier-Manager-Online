export const DEFAULT_POSTBOX_READ_RETENTION_DAYS = 7;

// Ein Tageslauf unabhängig von Sitzungen; der Leseindex überspringt alle ungelesenen Kopien.
export async function cleanupReadPostboxMessages(db, scheduledTime = Date.now()) {
  const now = new Date(scheduledTime).toISOString();
  const earliestCutoff = new Date(new Date(scheduledTime).getTime() - 86400000).toISOString();
  return db.batch([
    db.prepare(`DELETE FROM postbox_entries WHERE id IN (
      SELECT e.id FROM postbox_entries e JOIN users u ON u.id = e.user_id
      WHERE e.read_at IS NOT NULL AND e.read_at <= ?
        AND e.read_at <= strftime('%Y-%m-%dT%H:%M:%fZ', ?, '-' || u.postbox_read_retention_days || ' days')
    )`).bind(earliestCutoff, now),
    db.prepare(`DELETE FROM postbox_messages WHERE id IN (SELECT message_id FROM postbox_orphan_candidates)
      AND NOT EXISTS (SELECT 1 FROM postbox_entries WHERE message_id = postbox_messages.id)`),
    db.prepare('DELETE FROM postbox_orphan_candidates'),
  ]);
}
