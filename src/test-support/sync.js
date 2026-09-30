// Hilfen für Tests der Sync-API: bindet ein Turnier an ein Test-Dokument und baut Anfragen mit den Sync-Headern.
import { createHash } from 'node:crypto';

export const DOKUMENT = '11111111-1111-4111-8111-111111111111';
export const LEASE = 'lease-token-mit-ausreichender-laenge-0123456789';

export function leaseHash(lease = LEASE) {
  return createHash('sha256').update(lease).digest('hex');
}

// Bindet das Turnier an DOKUMENT; protocol 2 = neuer PTM mit Schreibzähler und Auftrags-ID.
export function bindeDokument(sqlite, tournamentId, { protocol = 1, counter = 0 } = {}) {
  sqlite.prepare(`UPDATE tournaments SET document_managed = 1, sync_document_id = ?, sync_lease_token_hash = ?,
      sync_binding_revision = 1, sync_protocol = ?, sync_write_counter = ? WHERE id = ?`)
    .run(DOKUMENT, leaseHash(), protocol, counter, tournamentId);
}

export function syncAnfrage(method, path, body, { counter, requestId, dokument = DOKUMENT, lease = LEASE } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-PTM-Sync-Document': dokument, 'X-PTM-Sync-Lease': lease };
  if (counter !== undefined) headers['X-PTM-Sync-Counter'] = String(counter);
  if (requestId !== undefined) headers['X-PTM-Request-Id'] = requestId;
  return new Request(`https://ptm.test${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}
