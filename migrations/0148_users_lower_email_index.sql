-- E-Mail-Abgleiche vergleichen ohne Groß-/Kleinschreibung (lower(email) = ? bzw. IN (…)) und lasen dafür die ganze
-- users-Tabelle. Ein Ausdrucksindex auf lower(email) macht daraus Index-Lookups (D1-Leselimit).
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(lower(email));
