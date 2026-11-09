-- Mêlée-Teams wie MeleeAnmeldungModus im Hauptprojekt: EINFACH (feste Teamgröße aus der Formation, Freilos möglich),
-- DOUBLETTE_OHNE_FREILOS / TRIPLETTE_OHNE_FREILOS (gemischte 2er- und 3er-Teams, immer gerade Teamzahl).
ALTER TABLE tournaments ADD COLUMN melee_team_mode TEXT NOT NULL DEFAULT 'EINFACH';
