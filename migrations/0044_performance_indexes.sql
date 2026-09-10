-- tournaments: Organisator-Nebenabfragen (Postbox-Dropdown, Dashboard-Zähler, Limit-Check)
CREATE INDEX idx_tournaments_created_by_name ON tournaments(created_by, name COLLATE NOCASE);

-- registrations: Listen-Sortierung, Sync-Cursor, Status-Filter+Sortierung
CREATE INDEX idx_registrations_tournament_registered_at ON registrations(tournament_id, registered_at);
CREATE INDEX idx_registrations_tournament_status_registered_at ON registrations(tournament_id, status, registered_at);
CREATE INDEX idx_registrations_tournament_updated_at ON registrations(tournament_id, updated_at);

-- jetzt redundant durch idx_registrations_tournament_status_registered_at (Präfix-Subsumption)
DROP INDEX idx_registrations_tournament_status;

-- Rate Limits: Zeitfenster-Filter direkt im Index (Covering Index bei login_attempts)
CREATE INDEX idx_login_attempts_email_created_at ON login_attempts(email, created_at);
CREATE INDEX idx_login_attempts_ip_created_at ON login_attempts(ip, created_at);
CREATE INDEX idx_geocode_attempts_ip_created_at ON geocode_attempts(ip, created_at);
CREATE INDEX idx_tournament_report_attempts_ip_created_at ON tournament_report_attempts(ip, created_at);
