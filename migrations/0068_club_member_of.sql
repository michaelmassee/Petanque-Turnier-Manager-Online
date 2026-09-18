-- Organisationen können angeben, Mitglied welcher Verbände sie sind (z. B. Deutscher Sportverband, internationale Verbände).
ALTER TABLE clubs ADD COLUMN member_of TEXT NOT NULL DEFAULT '[]';
