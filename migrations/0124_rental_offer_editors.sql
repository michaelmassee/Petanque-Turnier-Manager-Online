-- Platz mieten: Wie bei Turnieren (tournament_editors) können einzelnen Angeboten zusätzliche Verwalter zugeordnet
-- werden, die nicht Owner oder Bearbeiter des ganzen Vereins sind. Sie bearbeiten das Angebot, entscheiden über
-- dessen Anfragen und erhalten die Postfach-Meldungen dazu. Verwalter vergeben dürfen nur Vereinsverwalter und Admins.
-- Nur eine neue Tabelle, kein Umbau bestehender (D1-Regel: keine Table-Rebuilds).
CREATE TABLE rental_offer_editors (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES rental_offers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE(offer_id, user_id)
);

CREATE INDEX idx_rental_offer_editors_user ON rental_offer_editors(user_id);
