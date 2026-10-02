-- Schreibzähler und Auftrags-Idempotenz für die Sync-API des Turnierdokuments (Spezifikation E-24, T-19, T-23).
-- Nur ADD COLUMN bzw. neue Tabellen: tournaments hat eingehende ON-DELETE-CASCADE-Fremdschlüssel und darf nie
-- neu aufgebaut werden.
ALTER TABLE tournaments ADD COLUMN sync_write_counter INTEGER NOT NULL DEFAULT 0;
-- 1 = bisheriger PTM ohne Zähler/Auftrags-ID, 2 = PTM mit Zähler und Auftrags-ID (wird beim Verbinden gesetzt).
ALTER TABLE tournaments ADD COLUMN sync_protocol INTEGER NOT NULL DEFAULT 1;
-- Ausdrücklich geschlossene Online-Anmeldung, z. B. nach dem Zurücksetzen von `running` (E-23).
ALTER TABLE tournaments ADD COLUMN registration_closed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN running_reset_at TEXT;
-- Zeitpunkt des lokalen Rundenstarts in PTM; kann vor dem Eintreffen des Online-Starts liegen (KP-05).
ALTER TABLE tournaments ADD COLUMN local_started_at TEXT;

-- Ein Eintrag pro Schreibauftrag des Dokuments. Eintrag, fachliche Änderung und gespeicherte Antwort entstehen in
-- genau einem D1-Batch; einen sichtbaren Zwischenzustand gibt es nicht. counter ist NULL bei Verbinden/Übernahme.
CREATE TABLE sync_requests (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  counter INTEGER,
  sync_document_id TEXT,
  lease_token_hash TEXT,
  state TEXT NOT NULL CHECK (state IN ('claimed', 'done')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, request_id)
);

-- Kopie der verbundenen Datei: Ein Zählerstand, der nicht größer ist als der zuletzt angenommene, bricht den
-- ganzen Batch ab (E-24).
CREATE TRIGGER sync_requests_counter_guard
BEFORE INSERT ON sync_requests
WHEN NEW.counter IS NOT NULL
  AND NEW.counter <= (SELECT sync_write_counter FROM tournaments WHERE id = NEW.tournament_id)
BEGIN
  SELECT RAISE(ABORT, 'document_forked');
END;

-- Bindung zwischen Vorabprüfung und Batch gewechselt (Übernahme durch ein anderes Dokument).
CREATE TRIGGER sync_requests_binding_guard
BEFORE INSERT ON sync_requests
WHEN NEW.counter IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tournaments WHERE id = NEW.tournament_id
                  AND sync_document_id = NEW.sync_document_id
                  AND sync_lease_token_hash = NEW.lease_token_hash)
BEGIN
  SELECT RAISE(ABORT, 'binding_changed');
END;
