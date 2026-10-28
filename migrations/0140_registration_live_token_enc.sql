-- Persönlicher Live-Link wiederherstellbar: neben dem Hash (live_token_hash, zum Nachschlagen) der Token verschlüsselt
-- (AES-GCM, Schlüssel im Secret LIVE_LINK_KEY), damit die Turnierleitung ihn als QR-Code anzeigen kann, ohne den Link aus
-- der Bestätigungsmail ungültig zu machen. Alte Links liegen nur als Hash vor und werden erst beim nächsten Neusenden
-- wiederherstellbar. Nur ADD COLUMN – kein Table-Rebuild.
ALTER TABLE registrations ADD COLUMN live_token_enc TEXT;
