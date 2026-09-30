// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { connectTournament, takeoverTournamentDocument } from './worker.js';


const ALTES_DOKUMENT = '11111111-1111-4111-8111-111111111111';
const NEUES_DOKUMENT = '22222222-2222-4222-8222-222222222222';
const ALTE_LOKALE_ID = '33333333-3333-4333-8333-333333333333';
const LEASE = 'lease-token-mit-ausreichender-laenge-0123456789';

function anfrage(body) {
  return new Request('https://ptm.test/api/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('Dokumentbindung und lokale PTM-Online-IDs', () => {
  let db;

  const turnier = () => db.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const lokaleId = () => db.sqlite.prepare('SELECT local_registration_uuid FROM registrations WHERE id = ?').get('r1')
    .local_registration_uuid;

  function turnierMitBindung(syncDocumentId, bindingRevision) {
    db.sqlite.prepare(`UPDATE tournaments SET document_managed = ?, sync_document_id = ?, sync_lease_token_hash = ?,
        sync_binding_revision = ? WHERE id = 't1'`)
      .run(syncDocumentId ? 1 : 0, syncDocumentId, syncDocumentId ? 'alter-lease-hash' : null, bindingRevision);
  }

  beforeEach(() => {
    db = d1MitSchema();
    db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status,
        registered_at, created_at, updated_at, local_registration_uuid)
      VALUES ('r1', 't1', 'Eustachius', 'Goetze', 'eg@example.test', 'confirmed', '2026-09-01', '2026-09-01', '2026-09-01', ?)`)
      .run(ALTE_LOKALE_ID);
  });

  it('verwirft beim Verbinden eines neuen Dokuments die lokalen IDs des vorherigen', async () => {
    turnierMitBindung(null, 1);

    await connectTournament(anfrage({ syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE }), db,
      turnier());

    expect(lokaleId()).toBeNull();
  });

  it('behält die lokalen IDs, wenn sich dasselbe Dokument erneut verbindet', async () => {
    turnierMitBindung(null, 1);
    await connectTournament(anfrage({ syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE }), db,
      turnier());
    db.sqlite.prepare("UPDATE registrations SET local_registration_uuid = ? WHERE id = 'r1'").run(ALTE_LOKALE_ID);

    await connectTournament(anfrage({ syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE }), db,
      turnier());

    expect(lokaleId()).toBe(ALTE_LOKALE_ID);
  });

  it('verwirft bei der Übernahme durch ein anderes Dokument die lokalen IDs des abgelösten', async () => {
    turnierMitBindung(ALTES_DOKUMENT, 3);

    await takeoverTournamentDocument(anfrage({
      syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE, takeoverRequestId: '44444444-4444-4444-8444-444444444444',
      expectedBindingRevision: 3,
    }), db, turnier());

    expect(lokaleId()).toBeNull();
    expect(turnier()).toMatchObject({ sync_document_id: NEUES_DOKUMENT, sync_binding_revision: 4 });
  });

  it('lässt die lokalen IDs unverändert, wenn die Übernahme an einer veralteten Revision scheitert', async () => {
    turnierMitBindung(ALTES_DOKUMENT, 3);

    await expect(takeoverTournamentDocument(anfrage({
      syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE, takeoverRequestId: '44444444-4444-4444-8444-444444444444',
      expectedBindingRevision: 2,
    }), db, turnier())).rejects.toMatchObject({ status: 409 });

    expect(lokaleId()).toBe(ALTE_LOKALE_ID);
    expect(turnier()).toMatchObject({ sync_document_id: ALTES_DOKUMENT });
  });

  it('verbindet kein neues Dokument mit einem abgeschlossenen Turnier', async () => {
    turnierMitBindung(null, 1);
    db.sqlite.prepare("UPDATE tournaments SET status = 'finished' WHERE id = 't1'").run();

    await expect(connectTournament(anfrage({ syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE }), db, turnier()))
      .rejects.toMatchObject({ status: 409, details: { code: 'tournament_finished' } });
    expect(turnier().sync_document_id).toBeNull();
  });

  it('lässt kein anderes Dokument ein abgeschlossenes Turnier übernehmen', async () => {
    turnierMitBindung(ALTES_DOKUMENT, 3);
    db.sqlite.prepare("UPDATE tournaments SET status = 'finished' WHERE id = 't1'").run();

    await expect(takeoverTournamentDocument(anfrage({
      syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE, takeoverRequestId: '44444444-4444-4444-8444-444444444444',
      expectedBindingRevision: 3,
    }), db, turnier())).rejects.toMatchObject({ status: 409, details: { code: 'tournament_finished' } });
    expect(turnier()).toMatchObject({ sync_document_id: ALTES_DOKUMENT });
  });

  it('lässt die lokalen IDs anderer Turniere unverändert', async () => {
    db.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at)
      VALUES ('t2', 'u1', 'Anderes', '2026-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01')`).run();
    db.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status,
        registered_at, created_at, updated_at, local_registration_uuid)
      VALUES ('r2', 't2', 'Maria', 'Bieder', 'mb@example.test', 'confirmed', '2026-09-01', '2026-09-01', '2026-09-01', ?)`)
      .run(ALTE_LOKALE_ID);
    turnierMitBindung(null, 1);

    await connectTournament(anfrage({ syncDocumentId: NEUES_DOKUMENT, leaseToken: LEASE }), db,
      turnier());

    expect(db.sqlite.prepare("SELECT local_registration_uuid FROM registrations WHERE id = 'r2'").get()
      .local_registration_uuid).toBe(ALTE_LOKALE_ID);
  });
});
