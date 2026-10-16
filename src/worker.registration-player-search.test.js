// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createRegistration, getRegistrationWithTournament, updateRegistration } from './worker.js';
import { playerSelectionProof } from './registration-player-search.js';
import { d1MitSchema } from './test-support/d1.js';

describe('Protected registration player search', () => {
  let env;
  const actor = { id: 'owner', role: 'user', emailVerifiedAt: '2026-01-01' };
  const body = { feeSelections: [], registrationAnswers: [], firstName: 'Anna', lastName: 'Adler', playerEmail: 'anna@example.test' };
  const tournament = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const request = (path, payload, cookie = 'session-owner') => new Request(`https://ptm.test${path}`, {
    method: 'POST', headers: { Origin: 'https://ptm.test', Cookie: `ptm_session=${cookie}`, 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(payload),
  });
  const api = (kind, payload = {}, cookie) => worker.fetch(request(`/api/tournaments/t1/registration-players/${kind}`, {
    turnstileToken: 'fresh-token', ...payload,
  }, cookie), env);
  const selection = async (id = 'player', slot = 'primary', actorId = 'owner') => ({
    [slot]: { userId: id, proof: await playerSelectionProof(env, actorId, 't1', id, 'save') },
  });
  const create = async (changes = {}) => createRegistration(request('/api/tournaments/t1/registrations', {
    ...body, ...changes,
  }), env, tournament(), { session: { user: actor } });

  beforeEach(() => {
    env = { DB: d1MitSchema(), TURNSTILE_SECRET_KEY: 'test-secret', MAIL_QUEUE: { send: vi.fn() } };
    for (const name of ['PLAYER_SEARCH_ACCOUNT_LIMIT', 'PLAYER_SEARCH_IP_LIMIT', 'PLAYER_DETAILS_ACCOUNT_LIMIT', 'PLAYER_DETAILS_IP_LIMIT']) {
      env[name] = { limit: vi.fn(async () => ({ success: true })) };
    }
    env.DB.sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, username, role, email_verified_at, club, license_nr, password_salt, password_hash, created_at, updated_at) VALUES
      ('owner', 'owner@example.test', 'Olga', 'Orga', 'olga', 'user', '2026-01-01', 'Club', null, 's', 'h', '2026-01-01', '2026-01-01'),
      ('player', 'anna@example.test', 'Anna', 'Adler', 'anna', 'user', '2026-01-01', 'Club', 'L-123', 's', 'h', '2026-01-01', '2026-01-01'),
      ('same-name', 'other@example.test', 'Anna', 'Adler', 'anna2', 'user', '2026-01-01', 'Club', null, 's', 'h', '2026-01-01', '2026-01-01'),
      ('unverified', 'unverified@example.test', 'Anna', 'Unverified', 'unverified', 'user', null, 'Club', null, 's', 'h', '2026-01-01', '2026-01-01'),
      ('admin', 'admin@example.test', 'Anna', 'Admin', 'admin', 'admin', '2026-01-01', 'Club', null, 's', 'h', '2026-01-01', '2026-01-01'),
      ('extra', 'extra@example.test', 'Other', 'Person', 'extra', 'user', null, null, null, 's', 'h', '2026-01-01', '2026-01-01');
      UPDATE users SET first_name = 'Anna', last_name = 'System', club = 'Club' WHERE id = 'system-tournament-reports';
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES
      ('session-owner', 'owner', '2099-01-01', '2026-01-01'), ('session-player', 'player', '2099-01-01', '2026-01-01'), ('session-unverified', 'unverified', '2099-01-01', '2026-01-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-01-01', 'Ort', 'tete', 'registration', 'public', '2026-01-01', '2026-01-01');`);
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => Response.json({
      success: true, action: options.body.get('response') === 'details-token' ? 'registration_player_details' : 'registration_player_search', hostname: 'ptm.test',
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('returns bounded public search entries, including the current account, without private fields', async () => {
    const response = await api('search', { query: 'Club' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { players } = await response.json();
    expect(players.map((player) => player.id).sort()).toEqual(['owner', 'player', 'same-name']);
    expect(players.every((player) => player.proof && !('email' in player) && !('licenseNr' in player))).toBe(true);
    expect(env.PLAYER_SEARCH_ACCOUNT_LIMIT.limit).toHaveBeenCalledWith({ key: 'owner' });
    expect(env.PLAYER_SEARCH_IP_LIMIT.limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
  });

  it('reveals profile details only after explicit, separately challenged selection', async () => {
    const { players } = await (await api('search', { query: '@anna' })).json();
    const player = players.find((entry) => entry.id === 'player');
    const response = await api('details', { userId: player.id, proof: player.proof, turnstileToken: 'details-token' });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.player).toMatchObject({ id: 'player', email: 'anna@example.test', licenseNr: 'L-123' });
    const saved = await create({ playerSelections: { primary: { userId: 'player', proof: result.player.proof } } });
    expect(saved.status).toBe(201);
    expect(env.DB.sqlite.prepare('SELECT user_id, player_email, license_nr FROM registrations').get())
      .toEqual({ user_id: 'player', player_email: 'anna@example.test', license_nr: 'L-123' });
  });

  it('supports exact email only, escapes wildcards and limits results to 20', async () => {
    expect((await (await api('search', { query: 'ANNA@example.test' })).json()).players).toHaveLength(1);
    expect((await api('search', { query: 'anna@exam' })).status).toBe(400);
    expect((await api('search', { query: 'an' })).status).toBe(400);
    expect((await (await api('search', { query: '%%%' })).json()).players).toHaveLength(0);
    for (let i = 0; i < 25; i++) env.DB.sqlite.prepare(`INSERT INTO users
      (id, email, first_name, last_name, role, email_verified_at, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, 'Many', 'Players', 'user', '2026-01-01', 's', 'h', '2026-01-01', '2026-01-01')`).run(`many-${i}`, `many-${i}@example.test`);
    expect((await (await api('search', { query: 'Many' })).json()).players).toHaveLength(20);
  });

  it('rejects anonymous/unverified access and missing bot protection configuration', async () => {
    expect((await api('search', { query: 'Anna' }, 'none')).status).toBe(401);
    expect((await api('search', { query: 'Anna' }, 'session-unverified')).status).toBe(403);
    delete env.TURNSTILE_SECRET_KEY;
    expect((await api('search', { query: 'Anna' })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['PLAYER_SEARCH_ACCOUNT_LIMIT', 'PLAYER_SEARCH_IP_LIMIT', 'PLAYER_DETAILS_ACCOUNT_LIMIT', 'PLAYER_DETAILS_IP_LIMIT'])('enforces %s before search/profile reads', async (name) => {
    env[name].limit.mockResolvedValue({ success: false });
    const prepare = vi.spyOn(env.DB, 'prepare');
    const response = await api(name.includes('DETAILS') ? 'details' : 'search', { query: 'Anna', userId: 'player' });
    expect(response.status).toBe(429);
    expect(prepare.mock.calls.map(([sql]) => sql).some((sql) => /SELECT id, first_name/.test(sql))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed without rate limit bindings', async () => {
    delete env.PLAYER_SEARCH_ACCOUNT_LIMIT;
    expect((await api('search', { query: 'Anna' })).status).toBe(503);
  });

  it.each([
    { success: false },
    { success: true, action: 'wrong', hostname: 'ptm.test' },
    { success: true, action: 'registration_player_search', hostname: 'evil.test' },
  ])('rejects invalid, reused or wrong-context Turnstile responses before search reads: %j', async (result) => {
    fetch.mockResolvedValue(Response.json(result));
    const prepare = vi.spyOn(env.DB, 'prepare');
    expect((await api('search', { query: 'Anna' })).status).toBe(400);
    expect(prepare.mock.calls.some(([sql]) => /SELECT id, first_name/.test(sql))).toBe(false);
  });

  it('rejects missing tokens and cross-origin requests', async () => {
    expect((await api('search', { query: 'Anna', turnstileToken: null })).status).toBe(400);
    const crossOrigin = request('/api/tournaments/t1/registration-players/search', { query: 'Anna' });
    crossOrigin.headers.set('Origin', 'https://evil.test');
    expect((await worker.fetch(crossOrigin, env)).status).toBe(403);
  });

  it('checks tournament access for regular users and respects the desktop write lock for managers', async () => {
    env.DB.sqlite.exec("UPDATE tournaments SET visibility = 'private'");
    expect((await api('search', { query: 'Anna' }, 'session-player')).status).toBe(403);
    expect((await api('search', { query: 'Anna' })).status).toBe(200);
    env.DB.sqlite.exec('UPDATE tournaments SET desktop_execution = 1');
    expect((await api('search', { query: 'Anna' })).status).toBe(403);
  });

  it('does not permit arbitrary, tampered, expired or foreign selection receipts', async () => {
    const proof = await playerSelectionProof(env, 'owner', 't1', 'player');
    for (const invalid of [undefined, `${proof}x`, await playerSelectionProof(env, 'player', 't1', 'player'),
      await playerSelectionProof(env, 'owner', 'other-tournament', 'player'), await playerSelectionProof(env, 'owner', 't1', 'same-name')]) {
      expect((await api('details', { userId: 'player', proof: invalid, turnstileToken: 'details-token' })).status).toBe(400);
    }
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 300_001);
    expect((await api('details', { userId: 'player', proof, turnstileToken: 'details-token' })).status).toBe(400);
  });

  it('rejects deleted accounts, forged save selections, changed identity and duplicate selected accounts', async () => {
    await expect(create({ playerSelections: { primary: { userId: 'player', proof: 'fake' } } })).rejects.toMatchObject({ status: 400 });
    await expect(create({ firstName: 'Someone', playerSelections: await selection() })).rejects.toMatchObject({ status: 400 });
    const primary = await selection();
    await expect(create({ playerSelections: { ...primary, partner: primary.primary } })).rejects.toMatchObject({ status: 400 });
    env.DB.sqlite.exec("DELETE FROM users WHERE id = 'player'");
    await expect(create({ playerSelections: primary })).rejects.toMatchObject({ status: 400 });
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM registrations').get().n).toBe(0);
  });

  it('uses an explicit account change even when both accounts have the same name', async () => {
    await create({ playerSelections: await selection() });
    const id = env.DB.sqlite.prepare('SELECT id FROM registrations').get().id;
    const existing = await getRegistrationWithTournament(env.DB, id);
    const response = await updateRegistration(request(`/api/registrations/${id}`, {
      ...body, status: 'confirmed', playerSelections: await selection('same-name'),
    }), env, existing, actor);
    expect(response.status).toBe(200);
    expect(env.DB.sqlite.prepare('SELECT user_id, player_email FROM registrations').get())
      .toEqual({ user_id: 'same-name', player_email: 'other@example.test' });
  });
});
