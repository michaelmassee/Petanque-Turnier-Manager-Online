-- Ergebnismeldungen von Spielern bei Turnieren, die im Turnierdokument geführt werden (E-27, E-28).
-- Getrennt von tournament_matches, weil das Dokument die Partien einer Runde bei jeder Übertragung neu anlegt.
-- Die Partie ist über Rundennummer und Team-Zusammensetzung bestimmt, wie sie das Dokument übertragen hat.
-- status: open (wartet auf die Turnierleitung), accepted (ins Dokument übernommen), dismissed (verworfen),
-- superseded (das Dokument hat inzwischen selbst ein Ergebnis bzw. die Runde gelöscht).
CREATE TABLE document_result_reports (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  team_a_registration_ids TEXT NOT NULL,
  team_b_registration_ids TEXT NOT NULL,
  score_a INTEGER NOT NULL,
  score_b INTEGER NOT NULL,
  reported_by_registration_id TEXT NOT NULL,
  reported_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'superseded')),
  created_at TEXT NOT NULL,
  decided_at TEXT
);

-- Je Partie höchstens eine offene Meldung: eine parallele zweite Meldung scheitert atomar.
CREATE UNIQUE INDEX idx_document_result_reports_open_match ON document_result_reports
  (tournament_id, round_number, team_a_registration_ids, team_b_registration_ids) WHERE status = 'open';
CREATE INDEX idx_document_result_reports_tournament ON document_result_reports (tournament_id, status);
