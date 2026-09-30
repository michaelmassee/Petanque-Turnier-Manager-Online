-- Revisionssicheres Protokoll (Spezifikation T-14). Bewusst ohne Fremdschlüssel: Einträge überleben das Löschen
-- von Turnier, Anmeldung und Konto; nach der Frist aus DS-04 werden personenbezogene Angaben pseudonymisiert.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  registration_id TEXT,
  actor_user_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL,
  pseudonymized_at TEXT
);
CREATE INDEX audit_log_tournament_created ON audit_log (tournament_id, created_at);
