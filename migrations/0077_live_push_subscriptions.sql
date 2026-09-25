-- Push-Abos aus der Live-Ansicht: an die Meldung gebunden statt an ein Benutzerkonto, damit auch
-- Spieler ohne Login (persönlicher Live-Link) bei einer neuen Runde benachrichtigt werden können.
-- Ein Gerät kann mehrere Meldungen verfolgen (z. B. Familie), daher Schlüssel aus beiden Spalten.
-- Neue Tabelle, kein Rebuild bestehender Tabellen.
CREATE TABLE IF NOT EXISTS live_push_subscriptions (
  endpoint TEXT NOT NULL,
  registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (endpoint, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_live_push_subscriptions_registration ON live_push_subscriptions(registration_id);
