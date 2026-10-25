-- Ausschließlich aggregierte Versandzahlen, keine Empfänger oder Mailinhalte.
CREATE TABLE email_delivery_daily (
  day TEXT PRIMARY KEY,
  strato INTEGER NOT NULL DEFAULT 0 CHECK (strato >= 0),
  resend INTEGER NOT NULL DEFAULT 0 CHECK (resend >= 0)
);

CREATE TABLE email_delivery_tracking (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TEXT NOT NULL
);
INSERT INTO email_delivery_tracking (id, started_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
