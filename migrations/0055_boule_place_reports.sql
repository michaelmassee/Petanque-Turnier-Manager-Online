CREATE TABLE boule_place_report_tokens (
  token_hash TEXT PRIMARY KEY,
  place_id TEXT NOT NULL REFERENCES boule_places(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX idx_boule_place_report_tokens_place_id ON boule_place_report_tokens(place_id);
CREATE INDEX idx_boule_place_report_tokens_expires_at ON boule_place_report_tokens(expires_at);

CREATE TABLE boule_place_report_attempts (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_boule_place_report_attempts_ip_created_at ON boule_place_report_attempts(ip, created_at);
