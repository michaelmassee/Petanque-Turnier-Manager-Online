CREATE TABLE boule_place_favorites (
  place_id TEXT NOT NULL REFERENCES boule_places(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (place_id, user_id)
);

CREATE INDEX idx_boule_place_favorites_user ON boule_place_favorites(user_id);
