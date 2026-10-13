// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { toPublicTournament } from './worker.js';
import { registrationOpenStatus } from './worker-core.js';
import { releaseRegistrationOpenings, RegistrationOpeningScheduler } from './registration-opening.js';

const opening = '2099-06-01T10:00:00.000Z';
describe('Geplante Freigabe und einmalige Öffnungsnachrichten', () => {
  let env;
  const sql = (query, ...args) => env.DB.sqlite.prepare(query).run(...args);
  const row = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const subscribe = (user = 'u1') => sql(`INSERT INTO registration_opening_subscriptions VALUES (?, ?, 't1', '2026-10-13')`, `subscription-${user}`, user);
  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn(async () => {}) } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, language, created_at, updated_at) VALUES
      ('u1', 'one@example.test', 'user', 's', 'h', 'de', '2026-10-13', '2026-10-13'),
      ('u2', 'two@example.test', 'user', 's', 'h', 'en', '2026-10-13', '2026-10-13')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('session1', 'u1', '2199-01-01', '2026-10-13')`);
    sql(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, updated_at) VALUES
      ('https://fcm.googleapis.com/u1', 'u1', 'key', 'auth', '2026-10-13', '2026-10-13'),
      ('https://fcm.googleapis.com/u2', 'u2', 'key', 'auth', '2026-10-13', '2026-10-13')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, visibility, registration_opens_at, created_at, updated_at)
      VALUES ('t1', 'u1', 'Sommerturnier', '2099-07-01', '10:00', 'Ort', 'tete', 'registration', 'public', ?, '2026-10-13', '2026-10-13')`, opening);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function schedulerWithOneFailure() {
    let alarm = null;
    const storage = {
      getAlarm: async () => alarm,
      setAlarm: async (time) => { alarm = time; },
      deleteAlarm: async () => { alarm = null; },
    };
    const scheduler = new RegistrationOpeningScheduler({ storage, blockConcurrencyWhile: (fn) => fn() }, env);
    const fetch = vi.fn(() => scheduler.fetch()).mockRejectedValueOnce(new Error('scheduler offline'));
    env.REGISTRATION_OPENING_SCHEDULER = { idFromName: (name) => name, get: () => ({ fetch }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return { fetch, alarm: () => alarm, dirty: () => env.DB.sqlite.prepare('SELECT dirty FROM registration_opening_schedule_changes WHERE id = 1').get().dirty };
  }

  it('meldet ein gespeichertes neues Turnier trotz Alarmfehler erfolgreich und erneuert die Sitzung', async () => {
    const scheduler = schedulerWithOneFailure();
    sql('UPDATE sessions SET expires_at = ? WHERE id = ?', new Date(Date.now() + 86400000).toISOString(), 'session1');
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments', {
      method: 'POST', headers: { Cookie: 'ptm_session=session1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Neues Turnier', date: '2099-07-02', location: 'Berlin', latitude: 52.52, longitude: 13.405,
        status: 'registration', visibility: 'public', registrationOpensAt: '2099-06-02T10:00' }),
    }), env);
    expect(response.status).toBe(201);
    const { tournament } = await response.json();
    expect(tournament.name).toBe('Neues Turnier');
    expect(response.headers.get('Set-Cookie')).toContain('ptm_session=session1');
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM tournaments WHERE name = 'Neues Turnier'").get().count).toBe(1);
    expect(scheduler.dirty()).toBe(1);
    expect(console.error).toHaveBeenCalledWith('Registration opening schedule remains pending', expect.any(Error));

    // Der nächste Schreibzugriff zieht den noch offenen Zeitplan nach.
    const next = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/registration-opening-subscription', {
      method: 'PUT', headers: { Cookie: 'ptm_session=session1' },
    }), env);
    expect(next.status).toBe(200);
    expect(scheduler.alarm()).toBe(new Date(opening).getTime());
    expect(scheduler.dirty()).toBe(0);
  });

  it('bestätigt ein gespeichertes Abo trotz Alarmfehler und holt den Zeitplan im vorhandenen Cron nach', async () => {
    const scheduler = schedulerWithOneFailure();
    sql("UPDATE users SET email_verified_at = '2026-10-13'");
    const response = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/registration-opening-subscription', {
      method: 'PUT', headers: { Cookie: 'ptm_session=session1' },
    }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: true });
    expect(env.DB.sqlite.prepare('SELECT user_id FROM registration_opening_subscriptions').all()).toEqual([{ user_id: 'u1' }]);
    expect(scheduler.dirty()).toBe(1);

    let work;
    const runCron = async () => {
      await worker.scheduled({ cron: '0 * * * *' }, env, { waitUntil: (promise) => { work = promise; } });
      await work;
    };
    await runCron();
    expect(scheduler.fetch).toHaveBeenCalledTimes(2);
    expect(scheduler.alarm()).toBe(new Date(opening).getTime());
    expect(scheduler.dirty()).toBe(0);
    await runCron();
    expect(scheduler.fetch).toHaveBeenCalledTimes(2);
  });

  it('hält die Anmeldung bis zur tatsächlichen Freigabe gesperrt, auch wenn die Uhrzeit verstrichen ist', () => {
    expect(row().registration_opening_pending).toBe(1);
    expect(registrationOpenStatus(row(), new Date('2099-06-01T11:00:00Z'))).toBe('not_yet_open');
    expect(toPublicTournament(row(), null).registrationOpeningPending).toBe(true);
  });

  it('öffnet ohne Abos und führt keinen Push aus', async () => {
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(row().registration_opening_pending).toBe(0);
    expect(registrationOpenStatus(row(), new Date(opening))).toBe('open');
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('öffnet zuerst, schreibt die Postbox-Nachrichten und reiht danach lokalisierte Pushes ein', async () => {
    subscribe(); subscribe('u2');
    env.MAIL_QUEUE.sendBatch.mockImplementation(async () => {
      expect(row().registration_opening_pending).toBe(0);
      expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(2);
      expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM registration_opening_subscriptions').get().count).toBe(0);
    });
    await releaseRegistrationOpenings(env, new Date(opening));
    const batch = env.MAIL_QUEUE.sendBatch.mock.calls[0][0];
    expect(batch).toHaveLength(2);
    expect(batch.find((item) => item.body.userId === 'u2').body.payload.body).toBe('Sommerturnier: Registration is now open.');
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledOnce();
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(2);
  });

  it('folgt einem verschobenen Termin und öffnet bei einem alten Alarm nicht vorzeitig', async () => {
    subscribe();
    sql("UPDATE tournaments SET registration_opens_at = '2099-06-02T15:30:00.000Z' WHERE id = 't1'");
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(row().registration_opening_pending).toBe(1);
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
    await releaseRegistrationOpenings(env, new Date('2099-06-02T15:30:00Z'));
    expect(row().registration_opening_pending).toBe(0);
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledOnce();
  });

  it('berücksichtigt eine Datumsänderung unmittelbar vor dem atomaren Schreibvorgang', async () => {
    subscribe();
    env.DB.vorBatch((sqlite) => sqlite.exec("UPDATE tournaments SET registration_opens_at = '2099-06-05T10:00:00.000Z' WHERE id = 't1'"));
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(row().registration_opening_pending).toBe(1);
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM registration_opening_subscriptions').get().count).toBe(1);
  });

  it('verliert bei einer parallelen Änderung des Turnierbeginns keine Abonnenten', async () => {
    subscribe();
    env.DB.vorBatch((sqlite) => sqlite.exec("UPDATE tournaments SET date = '2099-08-01' WHERE id = 't1'"));
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(row().registration_opening_pending).toBe(1);
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledOnce();
  });

  it('öffnet sofort, wenn der geplante Termin entfernt oder vorgezogen wird', async () => {
    subscribe();
    sql("UPDATE tournaments SET registration_opens_at = NULL WHERE id = 't1'");
    expect(row().registration_opening_pending).toBe(1);
    await releaseRegistrationOpenings(env, new Date('2026-10-13T12:00:00Z'));
    expect(row().registration_opening_pending).toBe(0);
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledOnce();
  });

  it.each(["registration_closed = 1", "visibility = 'private'", "status = 'running'", "registration_enabled = 0"])
    ('respektiert eine nachträgliche Sperre: %s', async (change) => {
      subscribe(); sql(`UPDATE tournaments SET ${change} WHERE id = 't1'`);
      await releaseRegistrationOpenings(env, new Date(opening));
      expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
      expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM registration_opening_subscriptions').get().count).toBe(0);
    });

  it('verhindert Nachrichten nach dem angesetzten Turnierbeginn in der Turnierzeitzone', async () => {
    subscribe();
    sql("UPDATE tournaments SET date = '2099-06-01', start_time = '11:00', timezone = 'Europe/Berlin' WHERE id = 't1'");
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('verliert bei einem Queue-Fehler weder die Freigabe noch die Push-Aufträge', async () => {
    subscribe(); env.MAIL_QUEUE.sendBatch.mockRejectedValueOnce(new Error('queue offline'));
    await expect(releaseRegistrationOpenings(env, new Date(opening))).rejects.toThrow('queue offline');
    expect(row().registration_opening_pending).toBe(0);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM registration_opening_push_outbox').get().count).toBe(1);
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(1);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM registration_opening_push_outbox').get().count).toBe(0);
  });

  it('setzt und verschiebt einen echten einmaligen Alarm und entfernt ihn nach Freigabe', async () => {
    let alarm = null;
    const storage = { get: vi.fn(), delete: vi.fn(), getAlarm: vi.fn(async () => alarm), setAlarm: vi.fn(async (time) => { alarm = time; }), deleteAlarm: vi.fn(async () => { alarm = null; }) };
    const scheduler = new RegistrationOpeningScheduler({ storage, blockConcurrencyWhile: (fn) => fn() }, env);
    await scheduler.fetch();
    expect(alarm).toBe(new Date(opening).getTime());
    sql("UPDATE tournaments SET registration_opens_at = '2099-06-03T10:00:00.000Z' WHERE id = 't1'");
    await scheduler.fetch();
    expect(alarm).toBe(new Date('2099-06-03T10:00:00Z').getTime());
    vi.useFakeTimers(); vi.setSystemTime(new Date('2099-06-03T10:00:00Z'));
    await scheduler.alarm();
    expect(row().registration_opening_pending).toBe(0);
    expect(alarm).toBeNull();
  });

  it('bindet die API-Abos an das eingeloggte Konto und behandelt wiederholtes Aktivieren idempotent', async () => {
    const request = (method, cookie = 'session1') => new Request('https://ptm.test/api/tournaments/t1/registration-opening-subscription', {
      method, headers: { Cookie: `ptm_session=${cookie}` },
    });
    expect((await worker.fetch(request('PUT', 'missing'), env)).status).toBe(401);
    expect((await worker.fetch(request('PUT'), env)).status).toBe(200);
    expect((await worker.fetch(request('PUT'), env)).status).toBe(200);
    subscribe('u2');
    const own = await worker.fetch(new Request('https://ptm.test/api/me/registration-opening-subscriptions', { headers: { Cookie: 'ptm_session=session1' } }), env);
    expect(await own.json()).toEqual({ tournamentIds: ['t1'] });
    expect((await worker.fetch(request('DELETE'), env)).status).toBe(200);
    expect(env.DB.sqlite.prepare('SELECT user_id FROM registration_opening_subscriptions').all()).toEqual([{ user_id: 'u2' }]);
  });

  it('erzeugt ohne Push-Freigabe nur die Postbox-Nachricht und keinen Queue-Auftrag', async () => {
    subscribe(); sql('DELETE FROM push_subscriptions');
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(1);
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('begrenzt gleichzeitige Freigaben und Parameter auf die D1-Free-Limits', async () => {
    for (let index = 0; index < 44; index++) {
      sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, registration_opens_at, created_at, updated_at)
        VALUES (?, 'u1', 'Turnier', '2099-07-01', 'Ort', 'tete', 'registration', 'public', ?, '2026-10-13', '2026-10-13')`, `extra-${index}`, opening);
    }
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (statement) => {
      const prepared = prepare(statement);
      const bind = prepared.bind;
      prepared.bind = (...args) => { expect(args.length).toBeLessThanOrEqual(100); return bind(...args); };
      return prepared;
    };
    const pendingCount = () => env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournaments WHERE registration_opening_pending = 1').get().count;
    await releaseRegistrationOpenings(env, new Date(opening)); expect(pendingCount()).toBe(25);
    await releaseRegistrationOpenings(env, new Date(opening)); expect(pendingCount()).toBe(5);
    await releaseRegistrationOpenings(env, new Date(opening)); expect(pendingCount()).toBe(0);
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('hält die Postbox auch mit einer Öffnungsnachricht bei höchstens 25 Einträgen', async () => {
    subscribe();
    for (let index = 0; index < 25; index++) sql("INSERT INTO postbox_messages (id, recipient_id, kind, created_at) VALUES (?, 'u1', 'system', '2026-10-13')", `old-${index}`);
    await releaseRegistrationOpenings(env, new Date(opening));
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM postbox_messages').get().count).toBe(25);
    expect(env.DB.sqlite.prepare("SELECT id FROM postbox_messages WHERE id = 'subscription-u1'").get()).toBeTruthy();
  });
});
