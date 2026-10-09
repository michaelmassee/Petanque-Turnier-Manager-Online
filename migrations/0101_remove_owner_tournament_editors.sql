-- Owner haben ihre Bearbeitungsrechte bereits ueber tournaments.owner_id.
-- Historische manager_id-Uebernahmen konnten trotzdem einen identischen
-- tournament_editors-Datensatz anlegen; dieser ist redundant und verursacht
-- eine doppelte Anzeige in der Rechteverwaltung.
DELETE FROM tournament_editors
WHERE EXISTS (
  SELECT 1
  FROM tournaments
  WHERE tournaments.id = tournament_editors.tournament_id
    AND tournaments.owner_id = tournament_editors.user_id
);
