-- Profil-Verein optional mit dem Vereinsverzeichnis verknüpfen. users.club bleibt als Anzeigetext
-- (Freitext für Vereine ohne Verzeichniseintrag); bei Verknüpfung spiegelt er den Vereinsnamen.
-- Nur ADD COLUMN; SET NULL statt CASCADE, damit das Löschen eines Vereins keine Konten mitlöscht.
ALTER TABLE users ADD COLUMN club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX idx_users_club_id ON users(club_id);

-- Einmalige Bereinigung der Bestandsdaten (2026-10-07): korrekter Vereinsname für Petterweil ...
UPDATE clubs SET name = '1.PC-Petterweil von 1986 e.V.', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE name = '1. PC PETTERWEIL';

-- ... die frei getippten Schreibweisen (1. PC Petterweil, PCPetterweil, Peterweil, ...) zuordnen ...
UPDATE users SET club_id = (SELECT id FROM clubs WHERE name = '1.PC-Petterweil von 1986 e.V.')
WHERE club_id IS NULL AND (lower(club) LIKE '%petterweil%' OR lower(trim(club)) = 'peterweil');

UPDATE users SET club_id = (SELECT id FROM clubs WHERE name = 'Boule Club Linden e.V.')
WHERE club_id IS NULL AND lower(trim(club)) = 'bc linden';

-- ... und alle Profile, deren Text (ohne Groß-/Kleinschreibung) einem freigegebenen Verein entspricht.
UPDATE users SET club_id = (
  SELECT c.id FROM clubs c WHERE c.status = 'published' AND lower(trim(c.name)) = lower(trim(users.club)) ORDER BY c.created_at LIMIT 1
)
WHERE club_id IS NULL AND club IS NOT NULL;

UPDATE users SET club = (SELECT name FROM clubs WHERE clubs.id = users.club_id) WHERE club_id IS NOT NULL;
