-- Platz mieten: Vereine bieten Hallen/Plätze stundenweise an, registrierte Benutzer fragen eine Reservierung an,
-- der Verein bestätigt oder lehnt ab. Gebucht werden 1..lane_count Bahnen in vollen Stunden innerhalb eines Tages.
-- Nur neue Tabellen, kein Umbau bestehender (D1-Regel: keine Table-Rebuilds).
CREATE TABLE rental_offers (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  boule_place_id TEXT NOT NULL REFERENCES boule_places(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  lane_count INTEGER NOT NULL CHECK (lane_count BETWEEN 1 AND 200),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  price_note TEXT,
  min_hours INTEGER NOT NULL DEFAULT 1,
  max_hours INTEGER NOT NULL DEFAULT 4,
  booking_horizon_days INTEGER NOT NULL DEFAULT 60,
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_rental_offers_club ON rental_offers(club_id);

-- Öffnungszeiten je Wochentag (0 = Sonntag wie Date#getUTCDay), volle Stunden, close_hour 24 = Mitternacht.
CREATE TABLE rental_opening_hours (
  offer_id TEXT NOT NULL REFERENCES rental_offers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_hour INTEGER NOT NULL CHECK (open_hour BETWEEN 0 AND 23),
  close_hour INTEGER NOT NULL CHECK (close_hour BETWEEN 1 AND 24 AND close_hour > open_hour),
  PRIMARY KEY (offer_id, weekday)
);

CREATE TABLE rental_reservations (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES rental_offers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  start_hour INTEGER NOT NULL,
  hours INTEGER NOT NULL,
  lanes INTEGER NOT NULL,
  start_utc TEXT NOT NULL,
  end_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'rejected', 'cancelled')),
  note TEXT,
  decision_note TEXT,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_rental_reservations_offer_date ON rental_reservations(offer_id, local_date, status);
CREATE INDEX idx_rental_reservations_user ON rental_reservations(user_id, start_utc);
