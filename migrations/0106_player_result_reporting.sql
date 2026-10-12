-- Turnierleitung kann Ergebnismeldungen der beteiligten Spieler je Turnier freigeben.
-- Standard aus, damit bestehende Turniere ihr bisheriges Ergebnisverfahren behalten.
ALTER TABLE tournaments ADD COLUMN player_result_reporting_enabled INTEGER NOT NULL DEFAULT 0;
