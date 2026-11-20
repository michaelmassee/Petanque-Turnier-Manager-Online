-- Glocke „Anmeldung öffnet“: zusätzlich zur Postfach-Nachricht und zum Push eine E-Mail an jeden Abonnenten.
-- Eigene Outbox wie registration_opening_push_outbox (0110): wird im selben atomaren Freigabe-Batch befüllt, ein
-- Queue-Fehler verliert dadurch keine Mail. Nur CREATE, kein Table-Rebuild (D1-Regel).
CREATE TABLE IF NOT EXISTS registration_opening_mail_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  tournament_name TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  language TEXT NOT NULL
);
