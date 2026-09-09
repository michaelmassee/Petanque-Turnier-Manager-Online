ALTER TABLE tournaments ADD COLUMN club TEXT;
ALTER TABLE tournaments ADD COLUMN formation_other INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tournament_report_tokens (
  token_hash TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournament_report_tokens_tournament_id ON tournament_report_tokens(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_report_tokens_expires_at ON tournament_report_tokens(expires_at);

CREATE TABLE IF NOT EXISTS tournament_report_attempts (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournament_report_attempts_ip ON tournament_report_attempts(ip);
CREATE INDEX IF NOT EXISTS idx_tournament_report_attempts_created_at ON tournament_report_attempts(created_at);
