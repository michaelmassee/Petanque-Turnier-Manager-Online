-- Kennzeichnungen für den PTM-Zugangsweg und den Turnierstart (Spezifikation T-24, KP-04, KP-05).
ALTER TABLE registrations ADD COLUMN over_capacity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registrations ADD COLUMN received_after_start INTEGER NOT NULL DEFAULT 0;
-- 'online' = Anmeldeformular/Weboberfläche/API, 'document' = vom verbundenen PTM-Dokument angelegt.
ALTER TABLE registrations ADD COLUMN origin TEXT NOT NULL DEFAULT 'online';

-- Backfill: Vom Dokument angelegte Anmeldungen tragen ihre lokale UUID als Idempotenzschlüssel. Anlagen über die
-- ältere Sync-Route ohne UUID sind nicht unterscheidbar und bleiben 'online'.
UPDATE registrations SET origin = 'document' WHERE local_registration_uuid IS NOT NULL;
