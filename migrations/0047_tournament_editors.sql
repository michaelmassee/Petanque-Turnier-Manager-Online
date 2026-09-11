-- Turniererstellende können ab jetzt beliebig vielen Usern Bearbeitungsrechte für
-- einzelne Turniere erteilen (und wieder entziehen), statt wie bisher nur Admins
-- genau einen einzelnen "Turnierleiter" (manager_id) zuweisen zu lassen. Ersetzt
-- damit manager_id fachlich durch eine n:m-Zuordnung mit Audit-Feldern.
--
-- manager_id selbst bleibt als Spalte stehen (ungenutzt) statt sie per DROP COLUMN
-- zu entfernen: SQLite verweigert DROP COLUMN für Spalten, die Teil einer eigenen
-- FOREIGN KEY-Definition sind ("unknown column manager_id in foreign key
-- definition"), und ein Table-Rebuild von tournaments ist wegen der eingehenden
-- ON-DELETE-CASCADE-Fremdschlüssel (registrations, jetzt auch tournament_editors)
-- laut feedback-d1-migration-no-table-rebuild-Regel tabu (siehe migrations/0006,
-- gleiches Muster bereits dort für formation_other gewählt).
CREATE TABLE tournament_editors (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tournament_id, user_id)
);

CREATE INDEX idx_tournament_editors_tournament ON tournament_editors(tournament_id);
CREATE INDEX idx_tournament_editors_user ON tournament_editors(user_id);

-- Bestehende manager_id-Zuweisungen in das neue Mehrfach-System übernehmen.
INSERT INTO tournament_editors (id, tournament_id, user_id, granted_by, created_at)
SELECT lower(hex(randomblob(16))), id, manager_id, created_by, datetime('now')
FROM tournaments WHERE manager_id IS NOT NULL;
