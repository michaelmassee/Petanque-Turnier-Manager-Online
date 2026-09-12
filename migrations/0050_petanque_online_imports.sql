CREATE TABLE petanque_online_imports (
  source TEXT NOT NULL DEFAULT 'petanque-online',
  external_key TEXT NOT NULL,
  tournament_id TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (source, external_key),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX idx_petanque_online_imports_tournament_id ON petanque_online_imports(tournament_id);
