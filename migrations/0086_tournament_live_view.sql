-- Turnier-Option "Live-Ansicht": persönlicher Link in der Anmeldebestätigung und Push bei neuer Runde.
-- Standard aus, auch für bestehende Turniere. Nur ADD COLUMN, kein Table-Rebuild (tournaments hat eingehende
-- ON-DELETE-CASCADE-Fremdschlüssel, siehe migrations/0074).
ALTER TABLE tournaments ADD COLUMN live_view_enabled INTEGER NOT NULL DEFAULT 0;
