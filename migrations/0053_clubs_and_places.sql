CREATE TABLE clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  website_url TEXT,
  logo_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE club_editors (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE club_editor_requests (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE boule_places (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id) ON DELETE CASCADE,
  club_name TEXT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  court_count INTEGER NOT NULL DEFAULT 0 CHECK (court_count >= 0),
  description TEXT,
  accessible INTEGER NOT NULL DEFAULT 0,
  facilities TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  contact_name TEXT,
  contact_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE boule_place_likes (
  place_id TEXT NOT NULL REFERENCES boule_places(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (place_id, user_id)
);

ALTER TABLE tournaments ADD COLUMN boule_place_id TEXT REFERENCES boule_places(id) ON DELETE SET NULL;
CREATE INDEX idx_clubs_status_name ON clubs(status, name COLLATE NOCASE);
CREATE INDEX idx_club_editors_user ON club_editors(user_id);
CREATE INDEX idx_boule_places_club_status ON boule_places(club_id, status);
CREATE INDEX idx_boule_places_coordinates ON boule_places(latitude, longitude);
CREATE INDEX idx_boule_place_likes_place ON boule_place_likes(place_id);
CREATE INDEX idx_tournaments_boule_place ON tournaments(boule_place_id);
