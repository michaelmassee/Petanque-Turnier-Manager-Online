CREATE TABLE IF NOT EXISTS geocode_attempts (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geocode_attempts_ip ON geocode_attempts(ip);
CREATE INDEX IF NOT EXISTS idx_geocode_attempts_created_at ON geocode_attempts(created_at);
