-- Die Turnierseite/Anzeige aktualisiert sich jetzt über einen WebSocket (TournamentLiveHub) statt über Push-Abos.
-- Alte Abos werden nicht mehr beliefert; die Tabelle bleibt stehen (kein DROP TABLE, siehe D1-Regel).
DELETE FROM tournament_board_push_subscriptions;
