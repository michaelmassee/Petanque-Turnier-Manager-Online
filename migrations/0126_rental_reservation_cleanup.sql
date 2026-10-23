-- Tages-Cron: abgelaufene Mietanfragen und Reservierungen ohne vollständigen Tabellenscan löschen.
CREATE INDEX idx_rental_reservations_end_utc ON rental_reservations(end_utc);
