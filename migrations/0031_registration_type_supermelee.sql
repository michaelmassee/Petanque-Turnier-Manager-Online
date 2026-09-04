-- Supermelee wird vom Turniersystem zum Anmeldetyp. registration_type hat seit
-- 0029 keinen CHECK (reine App-Validierung), daher reicht hier eine Daten-Migration.
UPDATE tournaments SET registration_type = 'supermelee' WHERE type = 'supermelee';

-- type verliert 'supermelee', bekommt 'rangliste' dazu. SQLite/D1 kann einen
-- bestehenden CHECK nicht per ALTER aendern; DROP TABLE + RENAME wird hier bewusst
-- vermieden, da registrations.tournament_id per ON DELETE CASCADE auf tournaments
-- verweist (siehe Vorfall bei der users-Migration). Stattdessen neue Spalte mit
-- neuem CHECK anlegen, Werte uebertragen, alte Spalte droppen, neue umbenennen -
-- alles reine ALTER-TABLE-Operationen ohne Table-Rebuild.
ALTER TABLE tournaments ADD COLUMN type_new TEXT NOT NULL DEFAULT 'formule_x' CHECK (
  type_new IN (
    'formule_x',
    'jeder_gegen_jeden',
    'ko',
    'kaskaden',
    'liga',
    'maastrichter',
    'poule_ab',
    'rangliste',
    'schweizer',
    'trip_tete'
  )
);

UPDATE tournaments SET type_new = CASE WHEN type = 'supermelee' THEN 'rangliste' ELSE type END;

ALTER TABLE tournaments DROP COLUMN type;
ALTER TABLE tournaments RENAME COLUMN type_new TO type;
