// @vitest-environment node
// Sofort-Aktualisierung über WebSocket (TournamentLiveHub): Zugriffsprüfung beim Verbinden, "changed" nach Schreibzugriffen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, DOKUMENT, LEASE } from './test-support/sync.js';
import worker from './worker.js';
import { liveSocketChangedMessage, MAX_LIVE_SOCKETS_PER_TOURNAMENT, notifyTournamentChanged, TournamentLiveHub } from './tournament-live-hub.js';

const ORIGIN = 'https://ptm.test';
const LIVE_TOKEN = 'a'.repeat(40);
const PTM_ZUGANG = 'ptm-api-key-mit-ausreichender-laenge';

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
        const requestUrl = new URL(request.url);
        calls.push({ tournamentId: id, method: request.method, path: requestUrl.pathname, source: requestUrl.searchParams.get('source') });
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
    expect(offen.send).toHaveBeenCalledWith(liveSocketChangedMessage('online'));
    expect(weitere.send).toHaveBeenCalledWith(liveSocketChangedMessage('online'));
    expect(JSON.parse(offen.send.mock.calls[0][0])).toEqual({ type: 'changed', source: 'online' });
  });

  it('nennt die Quelle der Änderung, Unbekanntes gilt als Änderung aus PTM Online', async () => {
    const socket = { send: vi.fn() };
    const hub = hubWith([socket]);
    await hub.fetch(new Request('https://live-hub/notify?source=document', { method: 'POST' }));
    await hub.fetch(new Request('https://live-hub/notify?source=quatsch', { method: 'POST' }));

    expect(socket.send.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
      { type: 'changed', source: 'document' },
      { type: 'changed', source: 'online' },
    ]);
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
    expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([{ tournamentId: 't1', method: 'GET', path: '/api/tournaments/t1/schedule/socket', source: null }]);
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

  describe('Turnierdokument (Sync-API)', () => {
    const syncHeaders = (overrides = {}) => ({
      Authorization: `Bearer ${PTM_ZUGANG}`, 'X-PTM-Sync-Document': DOKUMENT, 'X-PTM-Sync-Lease': LEASE, ...overrides,
    });

    beforeEach(async () => {
      sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, approved_at, created_at, updated_at)
        VALUES ('key1', 'owner', ?, 'PTM', 'approved', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01')`, await sha256Hex(PTM_ZUGANG));
      bindeDokument(env.DB.sqlite, 't1');
    });

    it('verbindet das gebundene Dokument mit dem Hub seines Turniers', async () => {
      const response = await verbinden('/api/sync/tournaments/t1/socket', syncHeaders());
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('hub');
      expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([{ tournamentId: 't1', method: 'GET', path: '/api/sync/tournaments/t1/socket', source: null }]);
    });

    it('verweigert ohne gültigen Schlüssel, ohne WebSocket-Upgrade und einem fremden Veranstalter', async () => {
      expect((await verbinden('/api/sync/tournaments/t1/socket', syncHeaders({ Authorization: '' }))).status).toBe(401);
      expect((await verbinden('/api/sync/tournaments/t1/socket', syncHeaders({ Authorization: 'Bearer falsch' }))).status).toBe(401);
      expect((await worker.fetch(new Request(`${ORIGIN}/api/sync/tournaments/t1/socket`, { headers: syncHeaders() }), env)).status).toBe(426);
      sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
        VALUES ('fremd', 'fremd@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
      sql("UPDATE tournaments SET owner_id = 'fremd' WHERE id = 't1'");
      expect((await verbinden('/api/sync/tournaments/t1/socket', syncHeaders())).status).toBe(403);
      expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([]);
    });

    it('verweigert eine Kopie oder ein abgelöstes Dokument', async () => {
      expect((await verbinden('/api/sync/tournaments/t1/socket', syncHeaders({ 'X-PTM-Sync-Lease': 'veraltet' }))).status).toBe(409);
      expect((await verbinden('/api/sync/tournaments/t1/socket',
        syncHeaders({ 'X-PTM-Sync-Document': '22222222-2222-4222-8222-222222222222' }))).status).toBe(409);
      expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([]);
    });

    it('kennzeichnet Schreibzugriffe des Dokuments, damit PTM sein Echo erkennt', async () => {
      sql("UPDATE tournaments SET desktop_execution = 1 WHERE id = 't1'");
      const response = await worker.fetch(new Request(`${ORIGIN}/api/sync/tournaments/t1/ranking`, {
        method: 'PUT', headers: { ...syncHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [] }),
      }), env);
      expect(response.status).toBe(200);
      expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([{ tournamentId: 't1', method: 'POST', path: '/notify', source: 'document' }]);
    });
  });

  it('meldet nach einem Schreibzugriff auf das Turnier oder eine Meldung "changed" an den Hub', async () => {
    const schreiben = (path, body) => worker.fetch(new Request(`${ORIGIN}${path}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session', Origin: ORIGIN }, body: JSON.stringify(body),
    }), env);
    expect((await schreiben('/api/tournaments/t1/announcement', { text: 'Mittagspause' })).status).toBe(200);
    expect(env.TOURNAMENT_LIVE_HUB.calls).toEqual([{ tournamentId: 't1', method: 'POST', path: '/notify', source: 'online' }]);

    expect((await schreiben('/api/registrations/r1/participation', { participation: 'inactive' })).ok).toBe(true);
    expect(env.TOURNAMENT_LIVE_HUB.calls.map((call) => call.tournamentId)).toEqual(['t1', 't1']);

    // Abgelehnte Schreibzugriffe ändern nichts, also auch kein Nachladen.
    expect((await schreiben('/api/tournaments/fehlt/announcement', { text: 'x' })).ok).toBe(false);
    expect(env.TOURNAMENT_LIVE_HUB.calls).toHaveLength(2);
  });
});
