-- Persönliche Live-Ansicht für Spieler (Bereich "Live").
-- Nur ADD COLUMN, kein Table-Rebuild: registrations/tournaments haben eingehende
-- ON-DELETE-CASCADE-Fremdschlüssel (siehe migrations/0074).

-- Eigener Token für den Live-Link, bewusst getrennt vom cancel_token (Live-Link darf
-- nicht abmelden können). Wird lazy beim ersten Versand erzeugt.
ALTER TABLE registrations ADD COLUMN live_token TEXT;
-- Idempotenz-Merker für die Live-Link-Mail nach dem Check-in (Sync-Retries, erneutes Aktivieren).
ALTER TABLE registrations ADD COLUMN live_link_sent_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_live_token
  ON registrations(live_token)
  WHERE live_token IS NOT NULL;

-- Optionale Bahn (Freitext), aktuell nur aus dem Turnierdokument (Desktop-Durchführung).
ALTER TABLE tournament_matches ADD COLUMN court TEXT;

-- Ranglisten-Snapshot aus dem Turnierdokument; bei Desktop-Durchführung ist das
-- Hauptprojekt die Referenz für die Platzierung.
ALTER TABLE tournaments ADD COLUMN desktop_ranking_json TEXT;
