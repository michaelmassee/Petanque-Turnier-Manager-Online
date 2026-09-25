import { describe, expect, it } from 'vitest';
import { requireSyncLease } from './worker.js';

const documentId = 'e9e9caec-e0b1-4fe0-8fee-a229279b9f73';
const replacedDocumentId = 'd8d8caec-e0b1-4fe0-8fee-a229279b9f73';
const leaseToken = '01234567890123456789012345678901';

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function writeRequest(headers = {}) {
  return new Request('https://ptmonline.test/api/sync/tournaments/t1/metadata', {
    method: 'PUT',
    headers,
  });
}

describe('Sync-Lease für Turniermetadaten', () => {
  it('weist ein fehlendes oder ersetztes Dokument zurück', async () => {
    const tournament = { sync_document_id: documentId, sync_lease_token_hash: await sha256Hex(leaseToken) };

    await expect(requireSyncLease(writeRequest(), tournament)).rejects.toMatchObject({ status: 409, details: { code: 'document_replaced' } });
    await expect(requireSyncLease(writeRequest({
      'X-PTM-Sync-Document': replacedDocumentId,
      'X-PTM-Sync-Lease': leaseToken,
    }), tournament)).rejects.toMatchObject({ status: 409, details: { code: 'document_replaced' } });
  });

  it('weist ein fehlendes oder falsches Lease zurück', async () => {
    const tournament = { sync_document_id: documentId, sync_lease_token_hash: await sha256Hex(leaseToken) };

    await expect(requireSyncLease(writeRequest({ 'X-PTM-Sync-Document': documentId }), tournament)).rejects.toMatchObject({ status: 409, details: { code: 'lease_invalid' } });
    await expect(requireSyncLease(writeRequest({
      'X-PTM-Sync-Document': documentId,
      'X-PTM-Sync-Lease': 'abcdefghijklmnopqrstuvwxyz123456',
    }), tournament)).rejects.toMatchObject({ status: 409, details: { code: 'lease_invalid' } });
  });

  it('akzeptiert das aktuelle Dokument mit gültigem Lease', async () => {
    const tournament = { sync_document_id: documentId, sync_lease_token_hash: await sha256Hex(leaseToken) };

    await expect(requireSyncLease(writeRequest({
      'X-PTM-Sync-Document': documentId,
      'X-PTM-Sync-Lease': leaseToken,
    }), tournament)).resolves.toBeUndefined();
  });
});
