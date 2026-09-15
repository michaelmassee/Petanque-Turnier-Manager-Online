-- Pétanque Online is intentionally retired as a source. Its copied calendar
-- entries are source-owned and must not outlive the source integration.
DELETE FROM tournaments
WHERE id IN (SELECT tournament_id FROM petanque_online_imports);

DROP TABLE petanque_online_imports;

CREATE TABLE petanque_aktuell_imports (
  external_key TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX idx_petanque_aktuell_imports_tournament_id ON petanque_aktuell_imports(tournament_id);
