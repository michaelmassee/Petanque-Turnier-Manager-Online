// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import { executeSyncWrite, upsertDocumentRegistration } from './worker.js';

const LOKALE_ID = '55555555-5555-4555-8555-555555555555';
const AUFTRAG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Online-Anlage einer lokalen Meldung durch das Dokument (T-24)', () => {
  let env;
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const angelegt = () => env.DB.sqlite.prepare('SELECT * FROM registrations WHERE local_registration_uuid = ?').get(LOKALE_ID);
  const protokoll = () => env.DB.sqlite.prepare('SELECT action, actor_role FROM audit_log').all();

  function onlineAnmeldung(id, status) {
    env.DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status,
        registered_at, created_at, updated_at)
      VALUES (?, 't1', 'Online', ?, ?, ?, '2026-09-01', '2026-09-01', '2026-09-01')`).run(id, id, `${id}@example.test`, status);
  }

  function anlegen(optionen = {}) {
    const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/registrations/${LOKALE_ID}`,
      { firstName: 'Lokal', lastName: 'Nachmeldung', participation: 'active', feeSelections: [], registrationAnswers: [] },
      optionen);
    return executeSyncWrite(request, env.DB, turnier(), () => upsertDocumentRegistration(request, env, turnier(), LOKALE_ID));
  }

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    env.DB.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at, max_registrations, waitlist_enabled)
      VALUES ('t1', 'u1', 'Turnier', '2026-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01', 2, 0)`).run();
    bindeDokument(env.DB.sqlite, 't1');
  });

  it('legt die Meldung bestätigt und mit Herkunft Dokument an', async () => {
    const antwort = await anlegen();

    expect(antwort.status).toBe(201);
    expect((await antwort.json()).registration).toMatchObject({ firstName: 'Lokal', status: 'confirmed' });
    expect(angelegt()).toMatchObject({ status: 'confirmed', origin: 'document', over_capacity: 0, participation: 'active' });
    expect(protokoll()).toEqual([]);
  });

  it('nimmt eine Nachmeldung trotz voller Kapazität an und kennzeichnet sie (P-24)', async () => {
    onlineAnmeldung('o1', 'confirmed');
    onlineAnmeldung('o2', 'pending');
    onlineAnmeldung('o3', 'waitlist');

    const antwort = await anlegen();

    expect(antwort.status).toBe(201);
    expect(angelegt()).toMatchObject({ status: 'confirmed', over_capacity: 1 });
    expect(protokoll()).toEqual([{ action: 'registration_over_capacity', actor_role: 'document' }]);
  });

  it('zählt Warteliste und Stornos nicht als belegte Plätze', async () => {
    onlineAnmeldung('o1', 'confirmed');
    onlineAnmeldung('o2', 'waitlist');
    onlineAnmeldung('o3', 'cancelled');

    await anlegen();

    expect(angelegt().over_capacity).toBe(0);
  });

  it('legt ab running keine Online-Anmeldung mehr an (P-57)', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET status = 'running' WHERE id = 't1'").run();

    await expect(anlegen()).rejects.toMatchObject({ status: 409, details: { code: 'tournament_running' } });
    expect(angelegt()).toBeUndefined();
  });

  it('meldet tournament_running, wenn der Start zwischen Prüfung und Batch eintrifft, und bleibt dabei (P-70)', async () => {
    bindeDokument(env.DB.sqlite, 't1', { protocol: 2 });
    env.DB.vorBatch((sqlite) => sqlite.prepare("UPDATE tournaments SET status = 'running' WHERE id = 't1'").run());

    const antwort = await anlegen({ counter: 1, requestId: AUFTRAG });
    const wiederholung = await anlegen({ counter: 1, requestId: AUFTRAG });

    expect(antwort.status).toBe(409);
    expect(await antwort.json()).toMatchObject({ details: { code: 'tournament_running' } });
    expect(wiederholung.status).toBe(409);
    expect(wiederholung.headers.get('X-PTM-Replayed')).toBe('1');
    expect(angelegt()).toBeUndefined();
  });

  it('legt bei wiederholter Anlage keine zweite Meldung an', async () => {
    await anlegen();
    const zweite = await anlegen();

    expect(zweite.status).toBe(200);
    expect(await zweite.json()).toMatchObject({ created: false });
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM registrations WHERE tournament_id = 't1'").get().n).toBe(1);
  });
});
