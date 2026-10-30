// @vitest-environment node
// Spieler-Push und Abfragegrenze der Turnierseite; offene Turnierseiten/Anzeigen laden über den WebSocket
// (worker.live-socket.test.js) statt über Push-Abos.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

const ORIGIN = 'https://ptm.test';

describe('Push und Abfragegrenze rund um Runden', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const pushItems = () => env.MAIL_QUEUE.sendBatch.mock.calls.flatMap(([batch]) => batch.flatMap((message) => message.body.items));
  const neueRunde = () => worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/rounds`, {
    method: 'POST', headers: { Cookie: 'ptm_session=owner-session' },
  }), env);

  beforeEach(() => {
    const hubCalls = [];
    env = {
      DB: d1MitSchema(),
      MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
      TOURNAMENT_LIVE_HUB: { hubCalls, idFromName: (name) => name, get: (id) => ({ fetch: async () => { hubCalls.push(id); return new Response(null, { status: 204 }); } }) },
    };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, status, visibility, participants_public, created_at, updated_at, live_view_enabled)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'schweizer', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01', 0)`);
  });

  it('schickt bei neuer Runde ohne Live-Ansicht keinen Push, meldet die Änderung aber offenen Seiten', async () => {
    for (let index = 1; index <= 6; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01')`, `r${index}`, `Spieler ${index}`, `r${index}@example.test`);
    }
    expect((await neueRunde()).status).toBe(200);
    expect(pushItems()).toEqual([]);
    expect(env.TOURNAMENT_LIVE_HUB.hubCalls).toEqual(['t1']);
  });

  it('nennt im Spielplan, bis wann die Seite von selbst abfragt: 8 Stunden nach Beginn, ohne Startzeit bis Tagesende', async () => {
    const pollUntil = async () => (await (await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule`), env)).json()).pollUntil;
    sql("UPDATE tournaments SET start_time = '10:00', timezone = 'Europe/Berlin' WHERE id = 't1'");
    expect(await pollUntil()).toBe('2099-09-28T16:00:00.000Z');
    sql("UPDATE tournaments SET start_time = NULL WHERE id = 't1'");
    expect(await pollUntil()).toBe('2099-09-28T22:00:00.000Z');
    // Später als angesetzt gestartet: 8 Stunden ab dem tatsächlichen Start.
    sql("UPDATE tournaments SET start_time = '10:00', started_at = '2099-09-28T18:30:00.000Z' WHERE id = 't1'");
    expect(await pollUntil()).toBe('2099-09-29T02:30:00.000Z');
    // Noch nicht gestartet: mindestens bis Tagesende, damit eine vorab geöffnete Anzeige den Start mitbekommt.
    sql("UPDATE tournaments SET status = 'registration', started_at = NULL WHERE id = 't1'");
    expect(await pollUntil()).toBe('2099-09-28T22:00:00.000Z');
  });

  it('merkt sich beim Online-Start den tatsächlichen Startzeitpunkt', async () => {
    sql("UPDATE tournaments SET status = 'registration' WHERE id = 't1'");
    const response = await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/start`, {
      method: 'POST', headers: { Cookie: 'ptm_session=owner-session' },
    }), env);
    expect(response.status).toBe(200);
    expect(env.DB.sqlite.prepare("SELECT started_at FROM tournaments WHERE id = 't1'").get().started_at).toEqual(expect.stringMatching(/^\d{4}-\d\d-\d\dT/));
  });

  it('schickt bei neuer Runde nur Spielern mit Partie einen Push', async () => {
    sql("UPDATE tournaments SET live_view_enabled = 1 WHERE id = 't1'");
    for (let index = 1; index <= 7; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', ?, '2026-09-01', '2026-09-01', '2026-09-01')`,
      `r${index}`, `Spieler ${index}`, `r${index}@example.test`, index === 7 ? 'inactive' : 'active');
    }
    for (const registrationId of ['r1', 'r7']) {
      sql(`INSERT INTO live_push_subscriptions (endpoint, registration_id, p256dh, auth, created_at, updated_at)
        VALUES (?, ?, 'k', 'a', '2026-09-01', '2026-09-01')`, `https://fcm.googleapis.com/fcm/send/${registrationId}`, registrationId);
    }

    const response = await neueRunde();
    expect(response.status).toBe(200);

    const byEndpoint = Object.fromEntries(pushItems().map((item) => [item.endpoint, item.payload]));
    expect(byEndpoint['https://fcm.googleapis.com/fcm/send/r1']).toMatchObject({ title: 'Herbstturnier: Runde 1', eventType: 'live_update', tournamentId: 't1' });
    expect(byEndpoint['https://fcm.googleapis.com/fcm/send/r1'].silent).toBeUndefined();
    // Ohne eigene Partie keine (stille) Benachrichtigung; die offene Live-Ansicht lädt über den WebSocket neu.
    expect(byEndpoint['https://fcm.googleapis.com/fcm/send/r7']).toBeUndefined();
  });
});
