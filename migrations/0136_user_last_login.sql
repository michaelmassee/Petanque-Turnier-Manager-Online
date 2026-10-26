-- Erfolgreiche Konto-Anmeldungen dauerhaft speichern, unabhängig von Sitzungsbereinigung/Logout.
-- Historische Anmeldungen sind nicht vollständig rekonstruierbar und bleiben daher NULL.
ALTER TABLE users ADD COLUMN last_login_at TEXT;
