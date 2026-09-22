CREATE UNIQUE INDEX idx_clubs_normalized_name
  ON clubs(lower(trim(name)));

CREATE UNIQUE INDEX idx_boule_places_normalized_identity
  ON boule_places(lower(trim(name)), lower(trim(address)), venue_type);
