-- A tournament creator may explicitly require a manual review before accepting a registration.
-- Existing tournaments retain the historical behaviour: registrations are confirmed immediately.
ALTER TABLE tournaments ADD COLUMN approval_required INTEGER NOT NULL DEFAULT 0;
