-- Ein Endranglisten-Versand kann je Turnier genau einmal angestoßen werden.
CREATE TABLE tournament_ranking_email_dispatches (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  requested_at TEXT NOT NULL,
  pdf_attachments TEXT NOT NULL DEFAULT '{}'
);

-- Die individuellen Aufträge dokumentieren die deduplizierten Zieladressen.
CREATE TABLE tournament_ranking_email_deliveries (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  language TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempted_at TEXT,
  PRIMARY KEY (tournament_id, email)
);
