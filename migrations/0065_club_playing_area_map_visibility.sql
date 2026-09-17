-- Vereins-Spielflächen sind fachlich von allgemeinen Bouleplätzen getrennt.
-- Nur räumlich getrennte Vereins-Spielflächen erscheinen auf der Karte.
ALTER TABLE boule_places ADD COLUMN separate_from_club INTEGER NOT NULL DEFAULT 0 CHECK (separate_from_club IN (0, 1));

-- Bestehende, vereinsunabhängige Bouleplätze bleiben auf der Karte sichtbar.
UPDATE boule_places SET separate_from_club = 1 WHERE club_id IS NULL;
