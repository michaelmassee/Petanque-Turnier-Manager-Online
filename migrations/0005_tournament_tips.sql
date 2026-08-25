CREATE TABLE IF NOT EXISTS tournament_tips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  location TEXT,
  formation TEXT NOT NULL CHECK (formation IN ('tete', 'doublette', 'triplette', 'doublette_mixed', 'triplette_mixed')),
  info TEXT,
  external_link TEXT NOT NULL,
  flyer_link TEXT,
  submitter_name TEXT NOT NULL,
  submitter_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_verification', 'pending_review', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournament_tips_status_date ON tournament_tips(status, date);

CREATE TABLE IF NOT EXISTS tournament_tip_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  tip_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (tip_id) REFERENCES tournament_tips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournament_tip_verification_tip_id ON tournament_tip_verification_tokens(tip_id);
