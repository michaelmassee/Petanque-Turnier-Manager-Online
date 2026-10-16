// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createRegistration, getRegistrationWithTournament, updateRegistration } from './worker.js';
import { playerSelectionProof } from './registration-player-search.js';
import { d1MitSchema } from './test-support/d1.js';

describe('Protected registration player details', () => {
  let env;
  const actor = { id: 'owner', role: 'user', emailVerifiedAt: '2026-01-01' };
  const body = { feeSelections: [], registrationAnswers: [], firstName: 'Anna', lastName: 'Adler', playerEmail: 'anna@example.test' };
  const tournament = () => env.DB.sqlite.prepare("SELECT * FROM tournaments WHERE id = 't1'").get();
  const request = (path, payload, cookie = 'session-owner') => new Request(`https://ptm.test${path}`, {
    method: 'POST', headers: { Origin: 'https://ptm.test', Cookie: `ptm_session=${cookie}`, 'CF-Connecting-IP': '192.0.2.1' },
    body: JSON.stringify(payload),
  });
  const api = (kind, payload = {}, cookie) => worker.fetch(request(`/api/tournaments/t1/registration-players/${kind}`, {
    userId: 'player',
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
    for (const name of ['PLAYER_DETAILS_ACCOUNT_LIMIT', 'PLAYER_DETAILS_IP_LIMIT']) {
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
      success: true, action: 'registration_player_details', hostname: 'ptm.test',
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('reveals profile details only after a challenged selection and links the saved registration', async () => {
    const response = await api('details');
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.player).toMatchObject({ id: 'player', email: 'anna@example.test', licenseNr: 'L-123' });
    expect(env.PLAYER_DETAILS_ACCOUNT_LIMIT.limit).toHaveBeenCalledWith({ key: 'owner' });
    expect(env.PLAYER_DETAILS_IP_LIMIT.limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
    const saved = await create({ playerSelections: { primary: { userId: 'player', proof: result.player.proof } } });
    expect(saved.status).toBe(201);
    expect(env.DB.sqlite.prepare('SELECT user_id, player_email, license_nr FROM registrations').get())
      .toEqual({ user_id: 'player', player_email: 'anna@example.test', license_nr: 'L-123' });
  });

  it('rejects anonymous/unverified access and missing bot protection configuration', async () => {
    expect((await api('details', {}, 'none')).status).toBe(401);
    expect((await api('details', {}, 'session-unverified')).status).toBe(403);
    delete env.TURNSTILE_SECRET_KEY;
    expect((await api('details')).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['PLAYER_DETAILS_ACCOUNT_LIMIT', 'PLAYER_DETAILS_IP_LIMIT'])('enforces %s before profile reads', async (name) => {
    env[name].limit.mockResolvedValue({ success: false });
    const prepare = vi.spyOn(env.DB, 'prepare');
    const response = await api('details');
    expect(response.status).toBe(429);
    expect(prepare.mock.calls.map(([sql]) => sql).some((sql) => /SELECT id, first_name/.test(sql))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed without rate limit bindings', async () => {
    delete env.PLAYER_DETAILS_ACCOUNT_LIMIT;
    expect((await api('details')).status).toBe(503);
  });

  it.each([
    { success: false },
    { success: true, action: 'wrong', hostname: 'ptm.test' },
    { success: true, action: 'registration_player_details', hostname: 'evil.test' },
  ])('rejects invalid, reused or wrong-context Turnstile responses before profile reads: %j', async (result) => {
    fetch.mockResolvedValue(Response.json(result));
    const prepare = vi.spyOn(env.DB, 'prepare');
    expect((await api('details')).status).toBe(400);
    expect(prepare.mock.calls.some(([sql]) => /SELECT id, first_name/.test(sql))).toBe(false);
  });

  it('rejects missing tokens and cross-origin requests', async () => {
    expect((await api('details', { turnstileToken: null })).status).toBe(400);
    const crossOrigin = request('/api/tournaments/t1/registration-players/details', { userId: 'player' });
    crossOrigin.headers.set('Origin', 'https://evil.test');
    expect((await worker.fetch(crossOrigin, env)).status).toBe(403);
  });

  it('checks tournament access for regular users and respects the desktop write lock for managers', async () => {
    env.DB.sqlite.exec("UPDATE tournaments SET visibility = 'private'");
    expect((await api('details', {}, 'session-player')).status).toBe(403);
    expect((await api('details')).status).toBe(200);
    env.DB.sqlite.exec('UPDATE tournaments SET desktop_execution = 1');
    expect((await api('details')).status).toBe(403);
  });

  it('rejects unknown, unverified, admin and system accounts, and the removed search endpoint', async () => {
    for (const userId of [undefined, 'missing', 'unverified', 'admin', 'system-tournament-reports']) {
      expect((await api('details', { userId })).status).toBe(400);
    }
    expect((await api('search', { query: 'Anna' })).status).toBe(404);
  });

  it('does not accept tampered, expired or foreign save receipts', async () => {
    const proof = await playerSelectionProof(env, 'owner', 't1', 'player', 'save');
    for (const invalid of [`${proof}x`, await playerSelectionProof(env, 'player', 't1', 'player', 'save'),
      await playerSelectionProof(env, 'owner', 'other-tournament', 'player', 'save'), await playerSelectionProof(env, 'owner', 't1', 'player', 'details')]) {
      await expect(create({ playerSelections: { primary: { userId: 'player', proof: invalid } } })).rejects.toMatchObject({ status: 400 });
    }
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 300_001);
    await expect(create({ playerSelections: { primary: { userId: 'player', proof } } })).rejects.toMatchObject({ status: 400 });
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
