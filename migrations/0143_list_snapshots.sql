-- Zuletzt gebauter JSON-Text der gecachten Listen (Vereine, Plätze, Mietangebote). Die Cache API gilt nur im eigenen
-- Rechenzentrum; ohne diese Tabelle baut jedes Rechenzentrum nach einer Änderung die Liste neu aus den Quelltabellen
-- auf, mit ihr liest es wenige Zeilen. D1 erlaubt höchstens 2 MB je Wert, deshalb liegt der Text in Teilen
-- (part = 0, 1, …); beim Neuaufbau werden alle Teile einer Liste in einem Batch ersetzt.
-- Nur CREATE TABLE – kein Table-Rebuild, keine Fremdschlüssel.
CREATE TABLE IF NOT EXISTS list_snapshots (
  name TEXT NOT NULL,
  part INTEGER NOT NULL,
  version INTEGER NOT NULL,
  deploy TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (name, part)
);
