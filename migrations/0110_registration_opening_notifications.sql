ALTER TABLE tournaments ADD COLUMN registration_opening_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN registration_opening_event_id TEXT;
CREATE INDEX idx_tournaments_pending_opening ON tournaments(registration_opens_at) WHERE registration_opening_pending = 1;
CREATE INDEX idx_tournaments_opening_event ON tournaments(registration_opening_event_id) WHERE registration_opening_event_id IS NOT NULL;

CREATE TABLE registration_opening_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, tournament_id)
);
CREATE INDEX idx_opening_subscriptions_tournament ON registration_opening_subscriptions(tournament_id);
CREATE TABLE registration_opening_push_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  tournament_name TEXT NOT NULL,
  language TEXT NOT NULL,
  queued INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_opening_push_pending ON registration_opening_push_outbox(queued) WHERE queued = 0;
CREATE TABLE registration_opening_schedule_changes (id INTEGER PRIMARY KEY CHECK(id = 1), dirty INTEGER NOT NULL);
INSERT INTO registration_opening_schedule_changes VALUES (1, 1);

UPDATE tournaments SET registration_opening_pending = 1
WHERE registration_opens_at IS NOT NULL AND julianday(registration_opens_at) > julianday('now')
  AND status = 'registration' AND visibility = 'public' AND registration_enabled = 1 AND registration_closed = 0;

CREATE TRIGGER tournament_opening_insert AFTER INSERT ON tournaments BEGIN
  UPDATE tournaments SET registration_opening_pending = CASE
    WHEN NEW.status = 'registration' AND NEW.visibility = 'public' AND NEW.registration_enabled = 1
      AND NEW.registration_closed = 0 AND julianday(NEW.registration_opens_at) > julianday('now') THEN 1 ELSE 0 END
  WHERE id = NEW.id;
  UPDATE registration_opening_schedule_changes SET dirty = 1 WHERE id = 1;
END;
CREATE TRIGGER tournament_opening_update
AFTER UPDATE OF registration_opens_at, registration_closed, registration_enabled, status, visibility, date, start_time ON tournaments BEGIN
  UPDATE tournaments SET registration_opening_pending = CASE
    WHEN NEW.status != 'registration' OR NEW.visibility != 'public' OR NEW.registration_enabled != 1 OR NEW.registration_closed = 1 THEN 0
    WHEN NEW.registration_opens_at IS NOT OLD.registration_opens_at THEN CASE
      WHEN OLD.registration_opening_pending = 1 OR (NEW.registration_opens_at IS NOT NULL AND julianday(NEW.registration_opens_at) > julianday('now')) THEN 1 ELSE 0 END
    WHEN OLD.registration_opening_pending = 1 OR julianday(NEW.registration_opens_at) > julianday('now') THEN 1
    ELSE 0 END,
    registration_opening_event_id = CASE WHEN NEW.registration_opens_at IS NOT OLD.registration_opens_at THEN NULL ELSE registration_opening_event_id END
  WHERE id = NEW.id;
  DELETE FROM registration_opening_subscriptions WHERE tournament_id = NEW.id
    AND (NEW.status != 'registration' OR NEW.visibility != 'public' OR NEW.registration_enabled != 1 OR NEW.registration_closed = 1);
  UPDATE registration_opening_schedule_changes SET dirty = 1 WHERE id = 1;
END;
CREATE TRIGGER tournament_opening_delete AFTER DELETE ON tournaments BEGIN
  DELETE FROM registration_opening_subscriptions WHERE tournament_id = OLD.id;
  DELETE FROM registration_opening_push_outbox WHERE tournament_id = OLD.id;
  UPDATE registration_opening_schedule_changes SET dirty = 1 WHERE id = 1;
END;
CREATE TRIGGER user_opening_delete AFTER DELETE ON users BEGIN
  DELETE FROM registration_opening_subscriptions WHERE user_id = OLD.id;
  DELETE FROM registration_opening_push_outbox WHERE user_id = OLD.id;
END;
