-- Kalendereinträge (Turniere mit registration_enabled = 0, angelegt außerhalb der
-- öffentlichen "Turnier melden"-Funktion) werden nicht mehr genutzt; das dafür
-- eingeführte Pro-User-Limit entfällt entsprechend.
ALTER TABLE users DROP COLUMN calendar_entry_limit;
