-- Besucherstatistik fürs Admin-Dashboard: eindeutige Besucher pro Tag (UTC), getrennt nach angemeldeten Nutzern
-- und Gästen. visitor_days dient nur der Tages-Deduplizierung (Nutzer-ID bzw. Hash mit täglich wechselndem Salt)
-- und wird stündlich bis auf gestern/heute geleert; dauerhaft bleiben nur die Tagessummen in visitor_daily_counts.
-- Nur CREATE TABLE/TRIGGER – kein Table-Rebuild.
CREATE TABLE visitor_days (
  day TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'guest')),
  PRIMARY KEY (day, visitor_key)
);

CREATE TABLE visitor_daily_counts (
  day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'guest')),
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

-- Nur ein neuer Besucher des Tages (INSERT OR IGNORE hat tatsächlich eingefügt) erhöht die Tagessumme.
CREATE TRIGGER visitor_days_count
AFTER INSERT ON visitor_days
BEGIN
  INSERT INTO visitor_daily_counts (day, kind, visitors) VALUES (NEW.day, NEW.kind, 1)
  ON CONFLICT (day, kind) DO UPDATE SET visitors = visitors + 1;
END;
