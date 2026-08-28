CREATE TABLE IF NOT EXISTS turnierleiter_access_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_turnierleiter_access_requests_pending_user
ON turnierleiter_access_requests(user_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_turnierleiter_access_requests_status
ON turnierleiter_access_requests(status, requested_at);
