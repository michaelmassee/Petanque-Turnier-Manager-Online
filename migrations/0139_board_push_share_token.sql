-- Push-Abos der Turnierseite/Anzeige merken sich den Freigabe-Link, über den sie abgeschlossen wurden (Hash wie in
-- tournament_share_links.token_hash). Bei privaten Turnieren gehen Pushes nur an Abos, deren Link noch gültig ist;
-- ein Abo aus der Zeit, als das Turnier öffentlich war, bekommt nach dem Wechsel auf privat nichts mehr.
-- Nur ADD COLUMN – kein Table-Rebuild.
ALTER TABLE tournament_board_push_subscriptions ADD COLUMN share_token_hash TEXT;
