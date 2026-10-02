-- Persönlicher Live-Link nur noch als Hash (EW-02): Der Klartext-Token entfällt samt Index, ein neuer Link macht den
-- vorherigen ungültig. Bisher gespeicherte Klartext-Tokens stammen aus dem früheren Konzept und waren nie aktiv
-- (Live-Ansicht ist bei allen Turnieren aus); sie werden nicht übernommen.
-- Aufräumen nach dem Wegfall von Check-in-Nachricht und "Das bin ich nicht" (E-09, E-22).
-- Nur DROP INDEX/COLUMN auf Spalten ohne Fremdschlüssel und DROP TABLE auf Tabellen ohne eingehende Fremdschlüssel:
-- registrations und tournaments werden nicht neu aufgebaut, nichts kaskadiert.
DROP INDEX IF EXISTS idx_registrations_live_token;
ALTER TABLE registrations DROP COLUMN live_token;
ALTER TABLE registrations DROP COLUMN live_link_sent_at;
ALTER TABLE registrations ADD COLUMN live_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_live_token_hash
  ON registrations(live_token_hash)
  WHERE live_token_hash IS NOT NULL;

ALTER TABLE tournaments DROP COLUMN checkin_notification_enabled;
DROP TABLE IF EXISTS registration_link_declines;
DROP TABLE IF EXISTS checkin_notifications;
