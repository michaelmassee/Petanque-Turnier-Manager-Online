// @vitest-environment node
// Sofort-Aktualisierung der Turnierseite/Bildschirm-Anzeige: Push-Abo ohne Meldung, stiller Push bei neuer Runde
// und Ankündigung, Obergrenze je Turnier.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { deleteBoardPushSubscriptionsOfFinishedTournaments } from './worker.js';
import { MAX_BOARD_PUSH_SUBSCRIPTIONS } from './worker-core.js';

const ORIGIN = 'https://ptm.test';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Sofort-Aktualisierung der Turnierseite', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const abos = () => env.DB.sqlite.prepare('SELECT endpoint, language, page_url FROM tournament_board_push_subscriptions ORDER BY endpoint').all();
  const abonnieren = (body, method = 'POST') => worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule/push`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env);
  const abonnierenMitFreigabe = (share, body) => worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule/push?share=${share}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env);
  const ankuendigen = (text) => worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/announcement`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session' }, body: JSON.stringify({ text }),
  }), env);
  const abo = (endpoint, extra = {}) => ({ endpoint, keys: { p256dh: 'k', auth: 'a' }, ...extra });
  const pushItems = () => env.MAIL_QUEUE.sendBatch.mock.calls.flatMap(([batch]) => batch.flatMap((message) => message.body.items));

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, status, visibility, participants_public, created_at, updated_at, live_view_enabled)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'schweizer', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01', 0)`);
  });

  it('speichert ein Abo mit Sprache und nur eigener Turnierseite als Ziel', async () => {
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1', { language: 'fr', url: `${ORIGIN}/turnierseite/t1/anzeige?share=x` }))).status).toBe(201);
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/2', { url: 'https://evil.test/turnierseite/t1' }))).status).toBe(201);
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/3', { url: `${ORIGIN}/admin` }))).status).toBe(201);
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/4', { url: `${ORIGIN}.evil.example/turnierseite/t1` }))).status).toBe(201);
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/5', { url: 'kein url' }))).status).toBe(201);

    expect(abos()).toEqual([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/1', language: 'fr', page_url: `${ORIGIN}/turnierseite/t1/anzeige?share=x` },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/2', language: 'de', page_url: `${ORIGIN}/turnierseite/t1` },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/3', language: 'de', page_url: `${ORIGIN}/turnierseite/t1` },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/4', language: 'de', page_url: `${ORIGIN}/turnierseite/t1` },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/5', language: 'de', page_url: `${ORIGIN}/turnierseite/t1` },
    ]);

    expect((await abonnieren({ endpoint: 'https://fcm.googleapis.com/fcm/send/1' }, 'DELETE')).status).toBe(200);
    expect(abos().map((row) => row.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/2', 'https://fcm.googleapis.com/fcm/send/3',
      'https://fcm.googleapis.com/fcm/send/4', 'https://fcm.googleapis.com/fcm/send/5']);
  });

  it('lehnt ungültige Abos und nicht öffentliche Spielpläne ab', async () => {
    expect((await abonnieren({ endpoint: 'https://fcm.googleapis.com/fcm/send/1' })).status).toBe(400);
    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1'))).status).toBe(403);
    expect(abos()).toEqual([]);
  });

  it('begrenzt die Abos je Turnier, ein bekanntes Gerät darf sein Abo auffrischen', async () => {
    for (let index = 0; index < MAX_BOARD_PUSH_SUBSCRIPTIONS; index += 1) {
      sql(`INSERT INTO tournament_board_push_subscriptions (endpoint, tournament_id, p256dh, auth, language, page_url, created_at, updated_at)
        VALUES (?, 't1', 'k', 'a', 'de', ?, '2026-09-01', '2026-09-01')`, `https://fcm.googleapis.com/fcm/send/${index}`, `${ORIGIN}/turnierseite/t1`);
    }
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/neu'))).status).toBe(409);
    expect((await abonnieren(abo('https://fcm.googleapis.com/fcm/send/0', { language: 'en' }))).status).toBe(201);
  });

  it('hält die Obergrenze auch bei gleichzeitigen Anmeldungen ein', async () => {
    for (let index = 0; index < MAX_BOARD_PUSH_SUBSCRIPTIONS - 1; index += 1) {
      sql(`INSERT INTO tournament_board_push_subscriptions (endpoint, tournament_id, p256dh, auth, language, page_url, created_at, updated_at)
        VALUES (?, 't1', 'k', 'a', 'de', ?, '2026-09-01', '2026-09-01')`, `https://fcm.googleapis.com/fcm/send/${index}`, `${ORIGIN}/turnierseite/t1`);
    }
    const responses = await Promise.all([
      abonnieren(abo('https://fcm.googleapis.com/fcm/send/neu-a')),
      abonnieren(abo('https://fcm.googleapis.com/fcm/send/neu-b')),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(abos()).toHaveLength(MAX_BOARD_PUSH_SUBSCRIPTIONS);
  });

  it('schickt bei einer neuen Runde einen stillen Push, auch ohne freigeschaltete Live-Ansicht', async () => {
    for (let index = 1; index <= 6; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01')`, `r${index}`, `Spieler ${index}`, `r${index}@example.test`);
    }
    await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1', { language: 'en', url: `${ORIGIN}/turnierseite/t1/anzeige` }));

    const response = await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/rounds`, {
      method: 'POST', headers: { Cookie: 'ptm_session=owner-session' },
    }), env);
    expect(response.status).toBe(200);

    expect(pushItems()).toEqual([expect.objectContaining({
      endpoint: 'https://fcm.googleapis.com/fcm/send/1',
      payload: {
        title: 'Herbstturnier: Round 1', body: 'Schedule updated', url: `${ORIGIN}/turnierseite/t1/anzeige`,
        tag: 'board-round', silent: true, eventType: 'live_update', tournamentId: 't1',
      },
    })]);
  });

  it('schickt den Push auch an die eingeloggte Turnierleitung eines privaten Turniers ohne öffentliche Teilnehmerliste', async () => {
    // Wie ein Schnellstart-Turnier: privat, Teilnehmerliste nicht veröffentlicht, kein Freigabe-Link.
    sql("UPDATE tournaments SET visibility = 'private', participants_public = 0 WHERE id = 't1'");
    const alsLeitung = (body) => worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule/push`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session' }, body: JSON.stringify(body),
    }), env);
    expect((await alsLeitung(abo('https://fcm.googleapis.com/fcm/send/leitung', { url: `${ORIGIN}/turnierseite/t1` }))).status).toBe(201);
    expect(env.DB.sqlite.prepare('SELECT user_id FROM tournament_board_push_subscriptions').get()).toEqual({ user_id: 'owner' });

    await ankuendigen('Runde gleich');
    expect(pushItems()).toEqual([expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/leitung', payload: expect.objectContaining({ body: 'Runde gleich' }) })]);

    // Verwaltet das Konto das Turnier nicht mehr, bekommt das Abo nichts mehr.
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('andere', 'andere@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('andere-session', 'andere', '2099-01-01T00:00:00.000Z', '2026-09-01')");
    sql("UPDATE tournaments SET owner_id = 'andere' WHERE id = 't1'");
    env.MAIL_QUEUE.sendBatch.mockClear();
    const antwort = await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/announcement`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=andere-session' }, body: JSON.stringify({ text: 'Neue Leitung' }),
    }), env);
    expect(antwort.status).toBe(200);
    expect(pushItems()).toEqual([]);
  });

  it('merkt sich bei anonymen Abos kein Konto', async () => {
    await abonnieren(abo('https://fcm.googleapis.com/fcm/send/anonym'));
    expect(env.DB.sqlite.prepare('SELECT user_id FROM tournament_board_push_subscriptions').get()).toEqual({ user_id: null });
  });

  it('schickt Ankündigungen auch an die Turnierseite', async () => {
    await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1', { url: `${ORIGIN}/turnierseite/t1` }));
    await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/announcement`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session' }, body: JSON.stringify({ text: 'Mittagspause' }),
    }), env);

    expect(pushItems()).toEqual([expect.objectContaining({
      endpoint: 'https://fcm.googleapis.com/fcm/send/1',
      payload: expect.objectContaining({ title: 'Herbstturnier: Ankündigung', body: 'Mittagspause', url: `${ORIGIN}/turnierseite/t1`, eventType: 'live_update' }),
    })]);
  });

  it('schickt nach Entzug der Sichtbarkeit nichts mehr, Abmelden geht weiterhin', async () => {
    await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1', { url: `${ORIGIN}/turnierseite/t1` }));
    sql("UPDATE tournaments SET visibility = 'private', participants_public = 0 WHERE id = 't1'");
    expect((await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule`), env)).status).toBe(403);

    await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/announcement`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session' }, body: JSON.stringify({ text: 'Geheim' }),
    }), env);
    expect(pushItems()).toEqual([]);

    // Privat mit Freigabe-Link und veröffentlichter Teilnehmerliste: Das alte Abo (abgeschlossen, als das Turnier
    // öffentlich war) hat keinen Link nachgewiesen und bekommt nichts, auch wenn es inzwischen einen Link gibt.
    sql("UPDATE tournaments SET participants_public = 1 WHERE id = 't1'");
    sql(`INSERT INTO tournament_share_links (tournament_id, token_hash, token, created_at, updated_at)
      VALUES ('t1', ?, 'token', '2026-09-01', '2026-09-01')`, await sha256Hex('token'));
    expect((await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule`), env)).status).toBe(403);
    await ankuendigen('Ohne eigene Freigabe');
    expect(pushItems()).toEqual([]);

    // Über den Freigabe-Link abonniert: Der Push kommt an.
    expect((await abonnierenMitFreigabe('token', abo('https://fcm.googleapis.com/fcm/send/2'))).status).toBe(201);
    await ankuendigen('Mit Freigabe');
    expect(pushItems()).toEqual([expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/2', payload: expect.objectContaining({ body: 'Mit Freigabe' }) })]);

    // Link widerrufen und neu erzeugt: Das Abo des alten Links bekommt nichts mehr.
    sql("UPDATE tournament_share_links SET token_hash = ?, token = 'neu' WHERE tournament_id = 't1'", await sha256Hex('neu'));
    env.MAIL_QUEUE.sendBatch.mockClear();
    await ankuendigen('Nach Widerruf');
    expect(pushItems()).toEqual([]);

    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await abonnieren({ endpoint: 'https://fcm.googleapis.com/fcm/send/1' }, 'DELETE')).status).toBe(200);
    expect(abos().map((row) => row.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/2']);
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

  it('löscht im täglichen Aufräumen die Abos beendeter Turniere', async () => {
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, status, visibility, participants_public, created_at, updated_at)
      VALUES ('t2', 'owner', 'Sommerturnier', '2026-07-01', 'Ort', 'schweizer', 'tete', 'finished', 'public', 1, '2026-06-01', '2026-06-01')`);
    for (const tournamentId of ['t1', 't2']) {
      sql(`INSERT INTO tournament_board_push_subscriptions (endpoint, tournament_id, p256dh, auth, language, page_url, created_at, updated_at)
        VALUES ('https://fcm.googleapis.com/fcm/send/1', ?, 'k', 'a', 'de', ?, '2026-09-01', '2026-09-01')`, tournamentId, `${ORIGIN}/turnierseite/${tournamentId}`);
    }
    await deleteBoardPushSubscriptionsOfFinishedTournaments(env.DB);
    expect(env.DB.sqlite.prepare('SELECT tournament_id FROM tournament_board_push_subscriptions').all()).toEqual([{ tournament_id: 't1' }]);
  });

  it('schickt beim Turnierende einen stillen Push, damit auch eine pausierte Anzeige die Endrangliste zeigt', async () => {
    await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1', { language: 'en', url: `${ORIGIN}/turnierseite/t1/anzeige` }));
    const response = await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/publication`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session' },
      body: JSON.stringify({ status: 'finished', visibility: 'public' }),
    }), env);
    expect(response.status).toBe(200);

    expect(pushItems()).toEqual([expect.objectContaining({
      endpoint: 'https://fcm.googleapis.com/fcm/send/1',
      payload: {
        title: 'Herbstturnier: Tournament finished', body: 'Final ranking', url: `${ORIGIN}/turnierseite/t1/anzeige`,
        tag: 'board-round', silent: true, eventType: 'live_update', tournamentId: 't1',
      },
    })]);
  });

  it('schickt den Push auch beim automatischen Abschluss vergessener Turniere', async () => {
    // Der Stunden-Cron räumt unbestätigte Konten samt Turnieren ab; die Leitung ist hier bestätigt.
    sql("UPDATE users SET email_verified_at = '2026-09-01' WHERE id = 'owner'");
    sql("UPDATE tournaments SET date = '2026-09-20', start_time = '10:00' WHERE id = 't1'");
    await abonnieren(abo('https://fcm.googleapis.com/fcm/send/1', { url: `${ORIGIN}/turnierseite/t1` }));
    let work;
    await worker.scheduled({ cron: '0 * * * *', scheduledTime: Date.parse('2026-09-28T12:00:00.000Z') }, env, { waitUntil: (promise) => { work = promise; } });
    await work;

    expect(env.DB.sqlite.prepare("SELECT status FROM tournaments WHERE id = 't1'").get().status).toBe('finished');
    expect(pushItems()).toEqual([expect.objectContaining({ payload: expect.objectContaining({ title: 'Herbstturnier: Turnier beendet' }) })]);
  });

  it('aktualisiert bei neuer Runde auch die Live-Ansicht von Spielern ohne Partie', async () => {
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

    const response = await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/rounds`, {
      method: 'POST', headers: { Cookie: 'ptm_session=owner-session' },
    }), env);
    expect(response.status).toBe(200);

    const byEndpoint = Object.fromEntries(pushItems().map((item) => [item.endpoint, item.payload]));
    expect(byEndpoint['https://fcm.googleapis.com/fcm/send/r1']).toMatchObject({ title: 'Herbstturnier: Runde 1', eventType: 'live_update', tournamentId: 't1' });
    expect(byEndpoint['https://fcm.googleapis.com/fcm/send/r1'].silent).toBeUndefined();
    expect(byEndpoint['https://fcm.googleapis.com/fcm/send/r7']).toEqual({
      title: 'Herbstturnier: Runde 1', body: 'In dieser Runde nicht eingeteilt', url: `${ORIGIN}/live/r7`,
      tag: 'live-round-1', silent: true, eventType: 'live_update', tournamentId: 't1',
    });
  });
});
