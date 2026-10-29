// @vitest-environment node
// Öffentlicher Spielplan der Turnierseite: ganzes Turnier zum aktuellen Stand in einem Abruf, mit ETag.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { createTournamentShareLink } from './worker.js';

describe('Spielplan-Endpunkt (/schedule)', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const abrufen = (etag) => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/schedule', etag ? { headers: { 'If-None-Match': etag } } : {}), env);
  const anmeldung = (id, status = 'confirmed', participation = 'inactive') => sql(`INSERT INTO registrations
    (id, tournament_id, first_name, last_name, email, player_email, status, participation, registered_at, created_at, updated_at,
     phone, license_nr, organizer_message, user_id, partner_first_name, partner_last_name, partner_email, team_name)
    VALUES (?, 't1', ?, 'Adler', 'secret@example.test', 'secret@example.test', ?, ?, ?, '2026-09-01', '2026-09-01',
      '0123456789', 'L-123', 'Private Notiz', 'owner', 'Bert', 'Beispiel', 'partner@example.test', 'Team Adler')`,
  id, id, status, participation, `2026-09-01T10:00:0${id.length}Z`);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: () => {} } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, participants_public, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01')`);
  });

  it('liefert Runden, Rangliste, Status und Ankündigung und antwortet unverändert mit 304', async () => {
    const erste = await abrufen();
    expect(erste.status).toBe(200);
    expect(await erste.json()).toMatchObject({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null });

    const etag = erste.headers.get('ETag');
    expect((await abrufen(etag)).status).toBe(304);
  });

  it('liefert nach einer Ankündigung ein neues ETag mit der Ankündigung', async () => {
    const etag = (await abrufen()).headers.get('ETag');
    sql("UPDATE tournaments SET announcement = 'Mittagspause', announcement_at = '2026-10-21T11:00:00.000Z' WHERE id = 't1'");

    const neu = await abrufen(etag);
    expect(neu.status).toBe(200);
    expect((await neu.json()).announcement).toEqual({ text: 'Mittagspause', at: '2026-10-21T11:00:00.000Z' });
  });

  it.each(['registration', 'running'])('liefert vor der ersten Runde die Meldeliste mit Check-in-Status (%s), ohne private Felder', async (status) => {
    sql('UPDATE tournaments SET status = ? WHERE id = ?', status, 't1');
    anmeldung('Anna', 'confirmed', 'active');
    anmeldung('Clara', 'confirmed', 'inactive');
    anmeldung('Dirk', 'confirmed', 'withdrawn');
    anmeldung('Eva', 'pending', 'active');
    anmeldung('Finn', 'waitlist', 'active');
    anmeldung('Gina', 'cancelled');
    anmeldung('Hans', 'rejected');

    const response = await abrufen();
    expect(response.status).toBe(200);
    const { entries } = await response.json();
    expect(entries).toHaveLength(5);
    expect(entries.find((entry) => entry.persons[0].firstName === 'Anna')).toEqual({
      status: 'confirmed', participation: 'active', teamName: 'Team Adler', isVip: false,
      persons: [
        { firstName: 'Anna', lastName: 'Adler', club: null, accountConnected: true },
        { firstName: 'Bert', lastName: 'Beispiel', club: null, accountConnected: false },
      ],
    });
    expect(entries.find((entry) => entry.persons[0].firstName === 'Clara').participation).toBe('inactive');
    expect(entries.find((entry) => entry.persons[0].firstName === 'Dirk').participation).toBe('withdrawn');
    expect(entries.filter((entry) => entry.status !== 'confirmed').every((entry) => entry.participation === null)).toBe(true);
    for (const entry of entries) expect(Object.keys(entry).sort()).toEqual(['isVip', 'participation', 'persons', 'status', 'teamName']);
    expect(JSON.stringify(entries)).not.toMatch(/secret@example|partner@example|0123456789|L-123|Private Notiz|owner/);
  });

  it('ändert das ETag nach Check-in, neuen Meldungen und Absagen', async () => {
    anmeldung('Anna');
    let response = await abrufen();
    let etag = response.headers.get('ETag');
    expect((await abrufen(etag)).status).toBe(304);
    sql("UPDATE registrations SET participation = 'active' WHERE id = 'Anna'");
    response = await abrufen(etag);
    expect(response.status).toBe(200);
    expect((await response.json()).entries[0].participation).toBe('active');
    etag = response.headers.get('ETag');
    anmeldung('Bert');
    response = await abrufen(etag);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toHaveLength(2);
    etag = response.headers.get('ETag');
    sql("UPDATE registrations SET status = 'cancelled' WHERE id = 'Anna'");
    response = await abrufen(etag);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toHaveLength(1);
  });

  it('liefert nach der ersten Runde oder dem Turnierende keine Meldeliste mehr mit', async () => {
    anmeldung('Anna');
    sql("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('r1', 't1', 1, '2026-09-01')");
    expect((await (await abrufen()).json()).entries).toBeUndefined();
    sql("DELETE FROM tournament_rounds WHERE id = 'r1'");
    sql("UPDATE tournaments SET status = 'finished' WHERE id = 't1'");
    expect((await (await abrufen()).json()).entries).toBeUndefined();
  });

  it('gibt den Spielplan eines privaten Turniers mit gültigem Freigabe-Token heraus', async () => {
    sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");
    const created = await createTournamentShareLink(env.DB, 't1', 'https://ptm.test');
    const token = new URL((await created.json()).shareUrl).searchParams.get('share');
    const mitToken = (value) => worker.fetch(new Request(`https://ptm.test/api/tournaments/t1/schedule?share=${value}`), env);

    expect((await abrufen()).status).toBe(403);
    expect((await mitToken('falsch')).status).toBe(403);
    expect((await mitToken(token)).status).toBe(200);
    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await mitToken(token)).status).toBe(403);
  });

  it('gibt den Spielplan nicht heraus, wenn die Teilnehmerliste nicht öffentlich ist', async () => {
    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await abrufen()).status).toBe(403);
  });
});
