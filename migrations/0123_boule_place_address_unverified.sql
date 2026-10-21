-- Adresse ungeprüft (Meldung vom 2026-10-21): Die Verbandslisten (HPV, PVRLP, BBPV) enthalten pro Verein nur eine
-- Adresse, teils die Postanschrift (z. B. des Präsidenten) statt des Spielorts. Importierte Plätze werden gekennzeichnet,
-- bis die Verantwortlichen Adresse oder Koordinaten ändern oder die Adresse ausdrücklich als geprüft markieren.
-- Importiert = Verein mit Verbandseintrag, der noch dem Admin gehört. Nur ADD COLUMN, kein Table-Rebuild.
ALTER TABLE boule_places ADD COLUMN address_unverified INTEGER NOT NULL DEFAULT 0;
UPDATE boule_places SET address_unverified = 1
WHERE club_id IN (
  SELECT c.id FROM clubs c JOIN users u ON u.id = c.owner_id
  WHERE u.role = 'admin' AND COALESCE(c.member_of, '[]') NOT IN ('', '[]')
);
