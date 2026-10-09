-- Index für den Adress-Abgleich des Vereinslogos in der Turnierliste (lower(trim(address))). Nur CREATE INDEX.
CREATE INDEX IF NOT EXISTS idx_boule_places_normalized_address ON boule_places(lower(trim(address)));
