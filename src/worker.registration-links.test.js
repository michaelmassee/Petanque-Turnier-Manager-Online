// @vitest-environment node
// Verknüpfung Online-Anmeldung ↔ lokale PTM-Online-ID aus dem Dokument (T-21): ohne Datenänderung, damit das Dokument
// die Zuordnung importierter Anmeldungen auch nach dem Löschen der lokalen Zeile vom Server wiederherstellen kann.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import { executeSyncWrite, syncPostRegistrationLinks } from './worker.js';

const ONLINE_1 = '10000000-0000-4000-8000-000000000001';
const ONLINE_2 = '10000000-0000-4000-8000-000000000002';
const UNBEKANNT = '10000000-0000-4000-8000-0000000000ff';
const LOKAL_1 = '20000000-0000-4000-8000-000000000001';
const LOKAL_2 = '20000000-0000-4000-8000-000000000002';

describe('Verknüpfung importierter Anmeldungen (T-21)', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const zeile = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);
  const turnier = () => zeile("SELECT * FROM tournaments WHERE id = 't1'");
  const anmeldung = (id) => zeile(`SELECT local_registration_uuid, execution_revision, first_name, updated_at
      FROM registrations WHERE id = ?`, id);

  function legeAnmeldungAn(id, { lokal = null } = {}) {
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at,
        created_at, updated_at, local_registration_uuid, execution_revision)
      VALUES (?, 't1', 'Anna', 'Adler', ?, 'confirmed', 'inactive', '2026-09-01', '2026-09-01', '2026-09-01', ?, 3)`,
    id, `kontakt-${id}@example.test`, lokal);
  }

  function verknuepfe(links) {
    const request = syncAnfrage('POST', '/api/sync/tournaments/t1/registration-links', { links });
    return executeSyncWrite(request, env.DB, turnier(), (db) => syncPostRegistrationLinks(request, db, turnier()));
  }

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    sql(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at,
        email_verified_at) VALUES ('owner', 'leitung@example.test', 'L', 'K', 'user', 's', 'h', '2026-01-01', '2026-01-01',
        '2026-01-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, status, visibility,
        created_at, updated_at) VALUES ('t1', 'owner', 'Herbstpokal', '2099-09-28', 'Ort', 'doublette', 'forme',
        'registration', 'public', '2026-09-01', '2026-09-01')`);
    bindeDokument(env.DB.sqlite, 't1');
    legeAnmeldungAn(ONLINE_1);
    legeAnmeldungAn(ONLINE_2);
  });

  it('speichert die lokale ID, ohne Anmeldedaten oder Ausführungsrevision zu ändern', async () => {
    const antwort = await verknuepfe([{ onlineRegistrationId: ONLINE_1, localRegistrationUuid: LOKAL_1 },
      { onlineRegistrationId: UNBEKANNT, localRegistrationUuid: LOKAL_2 }]);

    expect(await antwort.json()).toEqual({ linked: 1, unknown: [UNBEKANNT], conflicts: [] });
    expect(anmeldung(ONLINE_1)).toMatchObject({ local_registration_uuid: LOKAL_1, execution_revision: 3, first_name: 'Anna' });
    expect(anmeldung(ONLINE_2).local_registration_uuid).toBeNull();
  });

  it('ist bei wiederholter Verknüpfung unverändert', async () => {
    await verknuepfe([{ onlineRegistrationId: ONLINE_1, localRegistrationUuid: LOKAL_1 }]);
    const antwort = await verknuepfe([{ onlineRegistrationId: ONLINE_1, localRegistrationUuid: LOKAL_1 }]);

    expect(await antwort.json()).toEqual({ linked: 1, unknown: [], conflicts: [] });
    expect(anmeldung(ONLINE_1)).toMatchObject({ local_registration_uuid: LOKAL_1, execution_revision: 3 });
  });

  it('lässt eine lokale ID bei der Anmeldung, die sie schon trägt', async () => {
    sql('UPDATE registrations SET local_registration_uuid = ? WHERE id = ?', LOKAL_1, ONLINE_2);

    const antwort = await verknuepfe([{ onlineRegistrationId: ONLINE_1, localRegistrationUuid: LOKAL_1 }]);

    expect(await antwort.json()).toEqual({ linked: 0, unknown: [], conflicts: [ONLINE_1] });
    expect(anmeldung(ONLINE_1).local_registration_uuid).toBeNull();
    expect(anmeldung(ONLINE_2).local_registration_uuid).toBe(LOKAL_1);
  });

  it('weist leere, zu große und doppelte Listen ab', async () => {
    await expect(verknuepfe([])).rejects.toMatchObject({ status: 400 });
    const zuViele = Array.from({ length: 201 }, () => ({ onlineRegistrationId: ONLINE_1, localRegistrationUuid: LOKAL_1 }));
    await expect(verknuepfe(zuViele)).rejects.toMatchObject({ status: 400 });
    await expect(verknuepfe([{ onlineRegistrationId: ONLINE_1, localRegistrationUuid: LOKAL_1 },
      { onlineRegistrationId: ONLINE_2, localRegistrationUuid: LOKAL_1 }])).rejects.toMatchObject({ status: 400 });
    await expect(verknuepfe([{ onlineRegistrationId: ONLINE_1, localRegistrationUuid: 'keine-uuid' }]))
      .rejects.toMatchObject({ status: 400 });
  });
});
