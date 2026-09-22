-- Stable document ownership and per-registration synchronization identities.
-- A document lease is deliberately separate from the account API key: a copied
-- or replaced Calc document cannot continue to write after a takeover.
ALTER TABLE tournaments ADD COLUMN sync_document_id TEXT;
ALTER TABLE tournaments ADD COLUMN sync_lease_token_hash TEXT;
ALTER TABLE tournaments ADD COLUMN sync_binding_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN sync_takeover_request_id TEXT;
ALTER TABLE tournaments ADD COLUMN sync_takeover_lease_token_hash TEXT;
ALTER TABLE tournaments ADD COLUMN desktop_execution INTEGER NOT NULL DEFAULT 0;

ALTER TABLE registrations ADD COLUMN local_registration_uuid TEXT;
ALTER TABLE registrations ADD COLUMN registration_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE registrations ADD COLUMN execution_revision INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_document_local_uuid
  ON registrations(tournament_id, local_registration_uuid)
  WHERE local_registration_uuid IS NOT NULL;
