-- owner_id (vormals created_by): tatsaechliche Rechteinhaberschaft eines Turniers. Rename
-- statt neuer Spalte, damit die bestehende NOT NULL + FOREIGN KEY ... ON DELETE CASCADE
-- Constraint erhalten bleibt (kein Table-Rebuild noetig, SQLite unterstuetzt
-- ALTER TABLE RENAME COLUMN seit 3.25 inkl. automatischer Anpassung abhaengiger Indizes).
ALTER TABLE tournaments RENAME COLUMN created_by TO owner_id;

-- Index kosmetisch umbenennen (Spaltenverweis im Index wird durch RENAME COLUMN bereits
-- automatisch aktualisiert, nur der Indexname bleibt sonst historisch).
DROP INDEX idx_tournaments_created_by_name;
CREATE INDEX idx_tournaments_owner_id_name ON tournaments(owner_id, name COLLATE NOCASE);

-- creator_id: rein informatives Feld, wer das Turnier urspruenglich erstellt hat. Bewusst
-- OHNE FOREIGN KEY / Constraint - darf verwaisen, wird nur beim Erstellen gesetzt und nie
-- wieder geaendert.
ALTER TABLE tournaments ADD COLUMN creator_id TEXT;
UPDATE tournaments SET creator_id = owner_id WHERE creator_id IS NULL;
