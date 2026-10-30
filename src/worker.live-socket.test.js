// @vitest-environment node
// Sofort-Aktualisierung über WebSocket (TournamentLiveHub): Zugriffsprüfung beim Verbinden, "changed" nach Schreibzugriffen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';
import { LIVE_SOCKET_CHANGED_MESSAGE, MAX_LIVE_SOCKETS_PER_TOURNAMENT, notifyTournamentChanged, TournamentLiveHub } from './tournament-live-hub.js';

const ORIGIN = 'https://ptm.test';
const LIVE_TOKEN = 'a'.repeat(40);

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Hub-Namespace als Attrappe: merkt sich, an welches Turnier welche Anfrage ging.
function fakeHubNamespace() {
  const calls = [];
  return {
    calls,
    idFromName: (name) => name,
    get: (id) => ({
      fetch: vi.fn(async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push({ tournamentId: id, method: request.method, path: new URL(request.url).pathname });
        return new Response('hub', { status: 200 });
      }),
    }),
  };
}

describe('TournamentLiveHub', () => {
  function hubWith(sockets) {
    return new TournamentLiveHub({ getWebSockets: () => sockets, acceptWebSocket: (socket) => sockets.push(socket) }, {});
  }

  it('meldet allen verbundenen Seiten nur "changed", auch wenn eine Verbindung gerade wegbricht', async () => {
    const offen = { send: vi.fn() };
    const kaputt = { send: vi.fn(() => { throw new Error('closed'); }) };
    const weitere = { send: vi.fn() };
    const response = await hubWith([offen, kaputt, weitere]).fetch(new Request('https://live-hub/notify', { method: 'POST' }));

    expect(response.status).toBe(204);
    expect(offen.send).toHaveBeenCalledWith(LIVE_SOCKET_CHANGED_MESSAGE);
    expect(weitere.send).toHaveBeenCalledWith(LIVE_SOCKET_CHANGED_MESSAGE);
    expect(JSON.parse(LIVE_SOCKET_CHANGED_MESSAGE)).toEqual({ type: 'changed' });
  });

  it('nimmt über der Obergrenze keine weitere Verbindung an', async () => {
    const sockets = Array.from({ length: MAX_LIVE_SOCKETS_PER_TOURNAMENT }, () => ({ send: vi.fn() }));
    const server = { close: vi.fn() };
    globalThis.WebSocketPair = function WebSocketPair() { return { 0: { client: true }, 1: server }; };
    const request = new Request('https://live-hub/socket', { headers: { Upgrade: 'websocket' } });
    const OriginalResponse = globalThis.Response;
    // Node kennt keinen Status 101; hier zählt nur, dass die Verbindung abgelehnt wird.
    globalThis.Response = function UpgradeResponse(body, init) { return { status: init.status, webSocket: init.webSocket }; };
    try {
      const response = await hubWith(sockets).fetch(request);
      expect(response.status).toBe(101);
      expect(server.close).toHaveBeenCalledWith(1013, expect.any(String));
    } finally {
      globalThis.Response = OriginalResponse;
      delete globalThis.WebSocketPair;
    }
  });

  it('lässt einen Schreibzugriff nie an einem ausgefallenen Hub scheitern', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { TOURNAMENT_LIVE_HUB: { idFromName: (name) => name, get: () => ({ fetch: () => Promise.reject(new Error('down')) }) } };
    await expect(notifyTournamentChanged(env, 't1')).resolves.toBeUndefined();
    await expect(notifyTournamentChanged({}, 't1')).resolves.toBeUndefined();
  });
});

describe('Socket-Endpunkte der Sofort-Aktualisierung', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const verbinden = (path, headers = {}) => worker.fetch(new Request(`${ORIGIN}${path}`, { headers: { Upgrade: 'websocket', ...headers } }), env);

  beforeEach(async () => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() }, TOURNAMENT_LIVE_HUB: fakeHubNamespace() };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, type, formation, status, visibility, participants_public, created_at, updated_at, live_view_enabled)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'schweizer', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, live_token_hash)
      VALUES ('r1', 't1', 'Anna', 'Adler', 'anna@example.test', 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01', ?)`, await sha256Hex(LIVE_TOKEN));
  });

  it('verbindet die Turnierseite mit dem Hub ihres Turniers', async () => {
    const response = await verbinden('/api/tournaments/t1/schedule/socket');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hub');
    expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([{ tournamentId: 't1', method: 'GET', path: '/api/tournaments/t1/schedule/socket' }]);
  });

  it('verweigert die Turnierseite ohne Sichtrecht, von fremden Seiten und ohne WebSocket-Upgrade', async () => {
    sql("UPDATE tournaments SET participants_public = 0 WHERE id = 't1'");
    expect((await verbinden('/api/tournaments/t1/schedule/socket')).status).toBe(403);
    sql("UPDATE tournaments SET participants_public = 1 WHERE id = 't1'");
    expect((await verbinden('/api/tournaments/t1/schedule/socket', { Origin: 'https://evil.test' })).status).toBe(403);
    expect((await worker.fetch(new Request(`${ORIGIN}/api/tournaments/t1/schedule/socket`), env)).status).toBe(426);
    expect((await verbinden('/api/tournaments/fehlt/schedule/socket')).status).toBe(404);
    expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([]);
  });

  it('verbindet die Live-Ansicht über den persönlichen Link, aber nur bei freigeschalteter Live-Ansicht', async () => {
    expect((await verbinden(`/api/live/token/${LIVE_TOKEN}/socket`)).status).toBe(200);
    expect((await verbinden(`/api/live/token/${'b'.repeat(40)}/socket`)).status).toBe(404);
    sql("UPDATE tournaments SET live_view_enabled = 0 WHERE id = 't1'");
    expect((await verbinden(`/api/live/token/${LIVE_TOKEN}/socket`)).status).toBe(409);
    expect(env.TOURNAMENT_LIVE_HUB.calls.map((call) => call.tournamentId)).toEqual(['t1']);
  });

  it('verlangt für die Live-Ansicht über das Konto eine Anmeldung', async () => {
    expect((await verbinden('/api/live/registrations/r1/socket')).status).toBe(401);
    expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([]);
  });

  it('meldet nach einem Schreibzugriff auf das Turnier oder eine Meldung "changed" an den Hub', async () => {
    const schreiben = (path, body) => worker.fetch(new Request(`${ORIGIN}${path}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session', Origin: ORIGIN }, body: JSON.stringify(body),
    }), env);
    expect((await schreiben('/api/tournaments/t1/announcement', { text: 'Mittagspause' })).status).toBe(200);
    expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([{ tournamentId: 't1', method: 'POST', path: '/notify' }]);

    expect((await schreiben('/api/registrations/r1/participation', { participation: 'inactive' })).ok).toBe(true);
    expect(env.TOURNAMENT_LIVE_HUB.calls.map((call) => call.tournamentId)).toEqual(['t1', 't1']);

    // Abgelehnte Schreibzugriffe ändern nichts, also auch kein Nachladen.
    expect((await schreiben('/api/tournaments/fehlt/announcement', { text: 'x' })).ok).toBe(false);
    expect(env.TOURNAMENT_LIVE_HUB.calls).toHaveLength(2);
  });
});
