// @vitest-environment node
// Bestehende Stunden- und Tages-Crons führen ihre jeweiligen Wartungsjobs aus.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

describe('Cron-Wartung', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const row = (statement, ...params) => env.DB.sqlite.prepare(statement).get(...params);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    // Der Stunden-Cron bereinigt auch unbestätigte Altkonten. Die Turnierleitung
    // muss deshalb als verifiziert angelegt sein, damit dieser Test nur den
    // Turnierabschluss prüft und nicht den separaten Kontobereinigungsjob.
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, email_verified_at, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01', '2026-01-01')`);
  });

  const scheduledTime = Date.parse('2026-10-23T01:00:00.000Z');

  async function runCron(cron = '0 * * * *') {
    let work;
    await worker.scheduled({ cron, scheduledTime }, env, { waitUntil: (promise) => { work = promise; } });
    await work;
  }

  it('schließt ein seit mehr als 48 Stunden laufendes Turnier und informiert nur die Leitung', async () => {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, visibility, created_at, updated_at)
      VALUES ('old', 'owner', 'Vergessenes Turnier', '2000-01-01', '10:00', 'Ort', 'tete', 'running', 'public', '2000-01-01', '2000-01-01')`);

    await runCron();

    expect(row("SELECT status FROM tournaments WHERE id = 'old'").status).toBe('finished');
    const notification = row("SELECT recipient_id, event_type, event_data FROM postbox_messages WHERE recipient_id = 'owner'");
    expect(notification).toMatchObject({ recipient_id: 'owner', event_type: 'tournament_status_changed' });
    expect(JSON.parse(notification.event_data)).toMatchObject({ tournamentId: 'old', status: 'finished', automatic: true });
  });

  it('schließt auch ein nie gestartetes Turnier (Anmeldung) 48 Stunden nach Beginn und informiert die Leitung', async () => {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, visibility, created_at, updated_at)
      VALUES ('registration', 'owner', 'Nie gestartet', '2000-01-01', '10:00', 'Ort', 'tete', 'registration', 'public', '2000-01-01', '2000-01-01')`);

    await runCron();

    expect(row("SELECT status FROM tournaments WHERE id = 'registration'").status).toBe('finished');
    const notification = row("SELECT event_data FROM postbox_messages WHERE recipient_id = 'owner'");
    expect(JSON.parse(notification.event_data)).toMatchObject({ tournamentId: 'registration', status: 'finished', automatic: true });
  });

  it('schließt ein vorab gestartetes Turnier 48 Stunden nach dem tatsächlichen Start, auch wenn das Datum in der Zukunft liegt', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: scheduledTime });
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, started_at, visibility, created_at, updated_at)
      VALUES ('early', 'owner', 'Schnellstart', '2099-12-24', '11:00', 'Ort', 'tete', 'running', '2026-10-20T10:00:00.000Z', 'private', '2026-10-20', '2026-10-20'),
             ('fresh', 'owner', 'Gerade gestartet', '2099-12-24', '11:00', 'Ort', 'tete', 'running', '2026-10-22T10:00:00.000Z', 'private', '2026-10-22', '2026-10-22'),
             ('notrunning', 'owner', 'Zurückgesetzt', '2099-12-24', '11:00', 'Ort', 'tete', 'registration', '2026-10-20T10:00:00.000Z', 'private', '2026-10-20', '2026-10-20')`);

    try { await runCron(); } finally { vi.useRealTimers(); }

    expect(row("SELECT status FROM tournaments WHERE id = 'early'").status).toBe('finished');
    expect(row("SELECT status FROM tournaments WHERE id = 'fresh'").status).toBe('running');
    expect(row("SELECT status FROM tournaments WHERE id = 'notrunning'").status).toBe('registration');
    expect(JSON.parse(row("SELECT event_data FROM postbox_messages WHERE recipient_id = 'owner'").event_data))
      .toMatchObject({ tournamentId: 'early', status: 'finished', automatic: true });
  });

  it('lässt Turniere innerhalb der 48 Stunden unverändert', async () => {
    // Uhr auf scheduledTime 2026-10-23T01:00Z: Beginn 21.10. 10:00 Berlin liegt 41 Stunden zurück.
    vi.useFakeTimers({ toFake: ['Date'], now: scheduledTime });
    sql(`INSERT INTO tournaments (id, owner_id, name, date, start_time, location, formation, status, visibility, created_at, updated_at)
      VALUES ('recent', 'owner', 'Gerade gespielt', '2026-10-21', '10:00', 'Ort', 'tete', 'registration', 'public', '2026-10-01', '2026-10-01'),
             ('future', 'owner', 'Zukünftiges Turnier', '2099-01-01', '10:00', 'Ort', 'tete', 'running', 'public', '2099-01-01', '2099-01-01')`);

    try { await runCron(); } finally { vi.useRealTimers(); }

    expect(row("SELECT status FROM tournaments WHERE id = 'recent'").status).toBe('registration');
    expect(row("SELECT status FROM tournaments WHERE id = 'future'").status).toBe('running');
    expect(row('SELECT COUNT(*) AS count FROM postbox_messages').count).toBe(0);
  });

  function seedRentals() {
    sql("INSERT INTO clubs (id, name, status, owner_id, created_at, updated_at) VALUES ('club', 'Club', 'published', 'owner', '2026-01-01', '2026-01-01')");
    sql("INSERT INTO boule_places (id, club_id, name, address, status, created_at, updated_at) VALUES ('place', 'club', 'Place', 'Berlin', 'published', '2026-01-01', '2026-01-01')");
    sql("INSERT INTO rental_offers (id, club_id, boule_place_id, title, lane_count, created_at, updated_at) VALUES ('offer', 'club', 'place', 'Angebot', 4, '2026-01-01', '2026-01-01')");
    for (const status of ['requested', 'confirmed', 'rejected', 'cancelled']) {
      for (const [period, offset] of [['past', -3600000], ['boundary', 0], ['ongoing', 3600000], ['future', 86400000]]) {
        const end = new Date(scheduledTime + offset).toISOString();
        const start = new Date(scheduledTime + offset - 7200000).toISOString();
        sql(`INSERT INTO rental_reservations (id, offer_id, user_id, local_date, start_hour, hours, lanes, start_utc, end_utc, status, created_at, updated_at)
          VALUES (?, 'offer', 'owner', ?, 0, 2, 1, ?, ?, ?, '2026-01-01', '2026-01-01')`, `${period}-${status}`, start.slice(0, 10), start, end, status);
      }
    }
  }

  it('löscht täglich abgelaufene Mietanfragen und Reservierungen in allen Status, auch exakt am Ablaufzeitpunkt', async () => {
    seedRentals();
    const prepare = vi.spyOn(env.DB, 'prepare');
    await runCron('0 1 * * *');

    const remaining = () => env.DB.sqlite.prepare('SELECT id FROM rental_reservations ORDER BY id').all().map(({ id }) => id);
    const expected = ['future', 'ongoing'].flatMap((period) => ['cancelled', 'confirmed', 'rejected', 'requested'].map((status) => `${period}-${status}`));
    expect(remaining()).toEqual(expected);
    expect(prepare.mock.calls.filter(([statement]) => statement.startsWith('DELETE FROM rental_reservations'))).toHaveLength(1);
    expect(row("SELECT COUNT(*) AS count FROM rental_offers WHERE id = 'offer'").count).toBe(1);
    // Erneute Zustellung desselben Tages-Crons ist unschädlich.
    await runCron('0 1 * * *');
    expect(remaining()).toEqual(expected);
  });

  it('führt beim Stunden-Cron keine Vermietungsbereinigung aus', async () => {
    seedRentals();
    const prepare = vi.spyOn(env.DB, 'prepare');
    await runCron();
    expect(row('SELECT COUNT(*) AS count FROM rental_reservations').count).toBe(16);
    expect(prepare.mock.calls.some(([statement]) => statement.includes('rental_reservations'))).toBe(false);
  });
});
