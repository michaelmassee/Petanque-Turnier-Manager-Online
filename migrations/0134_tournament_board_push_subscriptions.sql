-- Push-Abos der Turnierseite bzw. Bildschirm-Anzeige: an das Turnier gebunden statt an eine Meldung, damit ein
-- Bildschirm vor Ort (oder ein Zuschauer) bei jeder neuen Runde sofort neu lädt, statt bis zu 2 Minuten zu warten.
-- page_url: die Seite, die ein Klick auf die Benachrichtigung öffnet (z. B. die Anzeige mit Freigabe-Schlüssel).
-- Neue Tabelle, kein Rebuild bestehender Tabellen.
CREATE TABLE IF NOT EXISTS tournament_board_push_subscriptions (
  endpoint TEXT NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'de',
  page_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (endpoint, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_board_push_subscriptions_tournament ON tournament_board_push_subscriptions(tournament_id);
