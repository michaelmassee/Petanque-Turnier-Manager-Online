// @vitest-environment node
// Turnieroption Spielbahn wie im Hauptprojekt: X keine, L händisch, N 1..n, R zufällig; Freilose ohne Bahn.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { assignCourts, normalizeCourt, normalizeCourtMode } from './worker-core.js';
import worker from './worker.js';

const ORIGIN = 'https://ptm.test';

describe('assignCourts', () => {
  const match = (bye = false) => ({ teamA: ['a'], teamB: bye ? [] : ['b'] });

  it('nummeriert in Paarungsreihenfolge, Freilos ohne Bahn und ohne verbrauchte Nummer', () => {
    expect(assignCourts([match(), match(true), match(), match()], 'N')).toEqual(['1', null, '2', '3']);
  });

  it('verteilt bei zufällig genau die Nummern 1..n, Freilos ohne Bahn', () => {
    const courts = assignCourts([match(), match(), match(true), match(), match()], 'R', () => 0);
    expect(courts[2]).toBeNull();
    expect(courts.filter(Boolean).map(Number).sort()).toEqual([1, 2, 3, 4]);
    expect(courts.filter(Boolean)).not.toEqual(['1', '2', '3', '4']);
  });

  it('vergibt bei keine und händisch keine Bahn', () => {
    expect(assignCourts([match(), match()], 'X')).toEqual([null, null]);
    expect(assignCourts([match(), match()], 'L')).toEqual([null, null]);
  });

  it('prüft Modus und händische Bahn', () => {
    expect(normalizeCourtMode('R')).toBe('R');
    expect(() => normalizeCourtMode('Z')).toThrow('Ungültige Spielbahn-Einstellung');
    expect(normalizeCourt('  7 ')).toBe('7');
    expect(normalizeCourt('')).toBeNull();
    expect(() => normalizeCourt('x'.repeat(41))).toThrow('Ungültige Bahn');
    expect(() => normalizeCourt(7)).toThrow('Ungültige Bahn');
  });
});

describe('Spielbahn in der Spielverwaltung', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const rows = (statement, ...params) => env.DB.sqlite.prepare(statement).all(...params);
  const request = (path, method, body, session = 'owner-session') => worker.fetch(new Request(`${ORIGIN}${path}`, {
    method, headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('other', 'fremd@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01'),
             ('other-session', 'other', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, status, visibility, participants_public, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'schweizer', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01')`);
    // 7 Teams: 3 Partien plus Freilos.
    for (let index = 1; index <= 7; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', ?, 'Muster', ?, 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01')`, `r${index}`, `Spieler ${index}`, `r${index}@example.test`);
    }
  });

  const courts = () => rows("SELECT court, team_b_registration_ids AS teamB FROM tournament_matches ORDER BY match_index");

  it('vergibt standardmäßig keine Bahn', async () => {
    expect((await request('/api/tournaments/t1/rounds', 'POST')).status).toBe(200);
    expect(courts().every((row) => row.court === null)).toBe(true);
  });

  it('speichert die Option und nummeriert neue Runden durch, Freilos ohne Bahn', async () => {
    const saved = await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'N' });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ courtMode: 'N', byePointsFor: 13, byePointsAgainst: 7 });
    expect((await (await request('/api/tournaments/t1', 'GET')).json()).tournament.courtMode).toBe('N');

    expect((await request('/api/tournaments/t1/rounds', 'POST')).status).toBe(200);
    const result = courts();
    expect(result.filter((row) => row.teamB !== '[]').map((row) => row.court)).toEqual(['1', '2', '3']);
    expect(result.find((row) => row.teamB === '[]').court).toBeNull();
  });

  it('wendet das Umschalten sofort auf die aktuelle Runde an, frühere Runden bleiben', async () => {
    expect((await request('/api/tournaments/t1/rounds', 'POST')).status).toBe(200);
    sql('UPDATE tournament_matches SET score_a = 13, score_b = 5 WHERE score_a IS NULL');
    expect((await request('/api/tournaments/t1/rounds', 'POST')).status).toBe(200);
    const byRound = (number) => rows(`SELECT m.court, m.team_b_registration_ids AS teamB FROM tournament_matches m
      JOIN tournament_rounds r ON r.id = m.round_id WHERE r.round_number = ? ORDER BY m.match_index`, number);

    expect((await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'N' })).status).toBe(200);
    expect(byRound(2).filter((row) => row.teamB !== '[]').map((row) => row.court)).toEqual(['1', '2', '3']);
    expect(byRound(2).find((row) => row.teamB === '[]').court).toBeNull();
    expect(byRound(1).every((row) => row.court === null)).toBe(true);

    // „Leer“ behält die Bahnen zum Korrigieren, „Keine“ entfernt sie.
    expect((await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'L' })).status).toBe(200);
    expect(byRound(2).filter((row) => row.court).length).toBe(3);
    expect((await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'X' })).status).toBe(200);
    expect(byRound(2).every((row) => row.court === null)).toBe(true);
  });

  it('lehnt ungültige Optionen und fremde Nutzer ab', async () => {
    expect((await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'Z' })).status).toBe(400);
    expect((await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'N' }, 'other-session')).status).toBe(403);
    expect(rows("SELECT court_mode FROM tournaments WHERE id = 't1'")[0].court_mode).toBe('X');
  });

  it('trägt eine Bahn händisch ein und leert sie wieder', async () => {
    await request('/api/tournaments/t1/options', 'PUT', { courtMode: 'L' });
    expect((await request('/api/tournaments/t1/rounds', 'POST')).status).toBe(200);
    const [{ id }] = rows("SELECT id FROM tournament_matches WHERE team_b_registration_ids != '[]' ORDER BY match_index LIMIT 1");

    const response = await request(`/api/tournaments/t1/matches/${id}/court`, 'PUT', { court: ' 12 ' });
    expect(response.status).toBe(200);
    const match = (await response.json()).rounds[0].matches.find((entry) => entry.id === id);
    expect(match.court).toBe('12');

    expect((await request(`/api/tournaments/t1/matches/${id}/court`, 'PUT', { court: '' })).status).toBe(200);
    expect(rows('SELECT court FROM tournament_matches WHERE id = ?', id)[0].court).toBeNull();
    expect((await request('/api/tournaments/t1/matches/unbekannt/court', 'PUT', { court: '1' })).status).toBe(404);
    expect((await request(`/api/tournaments/t1/matches/${id}/court`, 'PUT', { court: '1' }, 'other-session')).status).toBe(403);
  });
});
