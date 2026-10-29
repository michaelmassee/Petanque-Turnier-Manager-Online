-- Sofort-Aktualisierung der Turnierseite für die eingeloggte Turnierleitung: Das Abo merkt sich das Konto, über das es
-- angelegt wurde. Der Versand prüft dann, ob dieses Konto das Turnier noch verwalten darf – so bekommen auch private
-- Turniere und Turniere ohne öffentliche Teilnehmerliste (z. B. Schnellstart) den Push, wie sie den Spielplan sehen.
-- Ohne Fremdschlüssel: Ein gelöschtes Konto verwaltet nichts mehr und fällt beim Versand von selbst heraus.
ALTER TABLE tournament_board_push_subscriptions ADD COLUMN user_id TEXT;
