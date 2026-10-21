// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { createRegistration, purgeExpiredPersonalData } from './worker.js';

describe('Telefonnummer bei der Anmeldung', () => {
  let env;
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const gespeichert = () => env.DB.sqlite.prepare("SELECT phone FROM registrations WHERE tournament_id = 't1'").all().map((row) => row.phone);

  function anmelden(body = {}, optionen = {}) {
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Neu', lastName: 'Team', playerEmail: 'neu@example.test', publicationNoticeAccepted: true,
        personsConsentAccepted: true, feeSelections: [], registrationAnswers: [], ...body }),
    });
    return createRegistration(request, env, turnier(), optionen);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01');`);
  });

  it('ist standardmäßig optional und speichert eine angegebene Nummer', async () => {
    expect(turnier().phone_required).toBe(0);
    await anmelden();
    await anmelden({ playerEmail: 'zwei@example.test', firstName: 'Zwei', phone: ' +33 6 12 34 56 78 ' });

    expect(gespeichert()).toEqual([null, '+33 6 12 34 56 78']);
  });

  it('verlangt die Nummer, wenn die Turnierleitung sie als Pflicht festlegt – nicht aber von der Turnierleitung selbst', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET phone_required = 1 WHERE id = 't1'").run();

    await expect(anmelden()).rejects.toMatchObject({ status: 400, details: { field: 'phone' } });
    await expect(anmelden({ phone: 'abc' })).rejects.toMatchObject({ status: 400 });
    expect((await anmelden({ playerEmail: 'leitung-erfasst@example.test' }, { session: { user: { id: 'owner', role: 'user' } } })).status).toBe(201);
  });

  it('zeigt die Nummer nur der Turnierleitung', async () => {
    const antwort = await (await anmelden({ phone: '0171 1234567' })).json();
    expect(antwort.registration.phone).toBeUndefined();

    const liste = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/registrations', {
      headers: { Cookie: 'ptm_session=owner-session' },
    }), env);
    expect(JSON.stringify(await liste.json())).toContain('0171 1234567');
  });

  it('löscht die Nummer mit den übrigen personenbezogenen Daten', async () => {
    await anmelden({ phone: '0171 1234567' });
    env.DB.sqlite.prepare("UPDATE tournaments SET status = 'finished', date = '2020-01-01' WHERE id = 't1'").run();

    await purgeExpiredPersonalData(env.DB, new Date('2026-10-21T00:00:00.000Z'));

    expect(gespeichert()).toEqual([null]);
  });
});
