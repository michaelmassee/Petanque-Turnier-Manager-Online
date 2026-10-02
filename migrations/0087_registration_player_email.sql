-- Die eigene Kontakt-E-Mail der Anmeldung entfällt (E-11, Entscheidung 2026-10-02): Die E-Mail von Spieler 1
-- (player_email) ist Pflicht und zugleich die Adresse der Anmeldung (email) für Bestätigung, Storno- und Live-Link.
-- Nur UPDATE, kein Table-Rebuild. Kontoverknüpfungen (user_id) bleiben unverändert: Die frühere Kontaktadresse war
-- oft die des Melders, nicht die von Spieler 1, und darf deshalb kein Konto automatisch verknüpfen.

-- 1. Ältere Anmeldungen ohne E-Mail von Spieler 1: die bisherige Kontaktadresse übernehmen (Platzhalter von
--    Anmeldungen ohne E-Mail und gelöschte Kontaktdaten ausgenommen).
UPDATE registrations
SET player_email = lower(trim(email))
WHERE (player_email IS NULL OR trim(player_email) = '')
  AND email IS NOT NULL AND trim(email) != ''
  AND lower(email) NOT LIKE '%@ohne-email.invalid';

-- 2. Anmeldungen mit abweichender Kontaktadresse: Die Anmeldung läuft künftig über die E-Mail von Spieler 1.
UPDATE registrations
SET email = lower(trim(player_email))
WHERE player_email IS NOT NULL AND trim(player_email) != ''
  AND email != lower(trim(player_email));
