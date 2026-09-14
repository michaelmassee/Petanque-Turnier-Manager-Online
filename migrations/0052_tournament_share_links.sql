-- Widerrufbare Freigabe-Links für private, nicht als Entwurf markierte Turniere.
CREATE TABLE tournament_share_links (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
