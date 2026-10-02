// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { createRegistration } from './worker.js';

describe('Atomare Online-Anmeldung (T-12)', () => {
  let env;
  const turnier = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const anmeldungen = () => env.DB.sqlite.prepare(
    "SELECT first_name, status, is_vip FROM registrations WHERE tournament_id = 't1' ORDER BY registered_at",
  ).all();
  const leitung = { user: { id: 'u1', role: 'user' } };

  function vorhandeneAnmeldung(id, status, registeredAt = '2026-09-01T10:00:00.000Z') {
    env.DB.sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status,
        registered_at, created_at, updated_at, cancel_token)
      VALUES (?, 't1', ?, 'Vorhanden', ?, ?, ?, ?, ?, ?)`)
      .run(id, id, `${id}@example.test`, status, registeredAt, registeredAt, registeredAt, `token-${id}`);
  }

  function anmelden(body = {}, optionen = {}) {
    const request = new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Neu', lastName: 'Anmeldung', playerEmail: 'neu@example.test', publicationNoticeAccepted: true, personsConsentAccepted: true,
        feeSelections: [], registrationAnswers: [], ...body,
      }),
    });
    return createRegistration(request, env, turnier(), optionen);
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`).run();
    env.DB.sqlite.prepare(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility,
        created_at, updated_at, max_registrations, waitlist_enabled)
      VALUES ('t1', 'u1', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01', 2, 1)`).run();
  });

  it('legt die Anmeldung bei freiem Platz an und schickt danach die Bestätigung', async () => {
    const antwort = await anmelden();

    expect(antwort.status).toBe(201);
    expect(anmeldungen()).toEqual([{ first_name: 'Neu', status: 'confirmed', is_vip: 0 }]);
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'neu@example.test' }));
  });

  it('setzt bei voller Kapazität auf die Warteliste; waitlist belegt keinen Platz', async () => {
    vorhandeneAnmeldung('a', 'confirmed');
    vorhandeneAnmeldung('b', 'pending');
    vorhandeneAnmeldung('c', 'waitlist');

    await anmelden();

    expect(anmeldungen().at(-1)).toMatchObject({ first_name: 'Neu', status: 'waitlist' });
  });

  it('vergibt den letzten Platz nicht doppelt, wenn parallel jemand zuvorkommt (P-14)', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET waitlist_enabled = 0 WHERE id = 't1'").run();
    vorhandeneAnmeldung('a', 'confirmed');
    env.DB.vorBatch(() => vorhandeneAnmeldung('parallel', 'confirmed', '2026-09-02T10:00:00.000Z'));

    await expect(anmelden()).rejects.toMatchObject({ status: 403 });

    expect(anmeldungen().map((zeile) => zeile.first_name)).toEqual(['a', 'parallel']);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it('nimmt keine Anmeldung mehr an, wenn der Start zwischen Prüfung und Batch eintrifft', async () => {
    env.DB.vorBatch((sqlite) => sqlite.prepare("UPDATE tournaments SET status = 'running' WHERE id = 't1'").run());

    await expect(anmelden()).rejects.toMatchObject({ status: 403, details: { code: 'tournament_running' } });

    expect(anmeldungen()).toEqual([]);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM postbox_messages').get().n).toBe(0);
  });

  it('lehnt ab, wenn die Turnierleitung die Anmeldung geschlossen hat', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET registration_closed = 1 WHERE id = 't1'").run();

    await expect(anmelden()).rejects.toMatchObject({ status: 403 });
    expect(anmeldungen()).toEqual([]);
  });

  it('schließt die Anmeldung mit dem angesetzten Turnierbeginn (P-65)', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET date = '2026-01-10', start_time = '10:00' WHERE id = 't1'").run();

    await expect(anmelden()).rejects.toMatchObject({ status: 403 });
    expect(anmeldungen()).toEqual([]);
  });

  it('verdrängt bei VIP-Anmeldung der Turnierleitung die jüngste Nicht-VIP-Anmeldung und benachrichtigt danach', async () => {
    vorhandeneAnmeldung('alt', 'confirmed', '2026-09-01T10:00:00.000Z');
    vorhandeneAnmeldung('jung', 'confirmed', '2026-09-02T10:00:00.000Z');

    await anmelden({ isVip: true, playerEmail: 'vip@example.test' }, { session: leitung });

    expect(anmeldungen()).toEqual([
      { first_name: 'alt', status: 'confirmed', is_vip: 0 },
      { first_name: 'jung', status: 'waitlist', is_vip: 0 },
      { first_name: 'Neu', status: 'confirmed', is_vip: 1 },
    ]);
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jung@example.test' }));
  });

  it('ignoriert ein VIP-Kennzeichen aus der Selbstanmeldung', async () => {
    vorhandeneAnmeldung('a', 'confirmed');
    vorhandeneAnmeldung('b', 'confirmed');

    await anmelden({ isVip: true });

    expect(anmeldungen()).toEqual([
      { first_name: 'a', status: 'confirmed', is_vip: 0 },
      { first_name: 'b', status: 'confirmed', is_vip: 0 },
      { first_name: 'Neu', status: 'waitlist', is_vip: 0 },
    ]);
  });
});
