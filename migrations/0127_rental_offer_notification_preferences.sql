-- Persönliche Postfach-/Push-Nachrichten pro Mietangebot und Verwalter.
-- Ohne Eintrag gilt Ja, auch für Owner und geerbte Vereinsbearbeiter.
CREATE TABLE rental_offer_notification_preferences (
  offer_id TEXT NOT NULL REFERENCES rental_offers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (offer_id, user_id)
);

CREATE INDEX idx_rental_offer_notification_preferences_user ON rental_offer_notification_preferences(user_id);
