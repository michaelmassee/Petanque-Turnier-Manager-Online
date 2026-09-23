-- Per "Turnier melden" bestätigte Kalendereinträge wurden bisher auf 'running' gesetzt und
-- erschienen dadurch als "Läuft". Wie importierte Termine (petanque-aktuell) gelten sie als
-- sichtbar mit status 'registration'; online durchführbar sind sie nie (registration_enabled = 0).
UPDATE tournaments SET status = 'registration' WHERE registration_enabled = 0 AND status = 'running';
