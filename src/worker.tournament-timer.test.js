// @vitest-environment node
// Rundenzeit-Timer der Turnierleitung: Endzeit/Restzeit am Turnier, sichtbar in Live-Ansicht und auf der Turnierseite.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const TOKEN = 'b'.repeat(64);
const NOW = Date.parse('2099-09-28T10:00:00.000Z');

describe('Rundenzeit-Timer', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const steuern = (body, session = 'owner-session') => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/timer', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `ptm_session=${session}` }, body: JSON.stringify(body),
  }), env);
  const live = (etag) => worker.fetch(new Request(`https://ptm.test/api/live/token/${TOKEN}`, etag ? { headers: { 'If-None-Match': etag } } : {}), env);
  const spielplan = (etag) => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/schedule', etag ? { headers: { 'If-None-Match': etag } } : {}), env);
  const turnier = async (session) => (await (await worker.fetch(new Request('https://ptm.test/api/tournaments/t1',
    session ? { headers: { Cookie: `ptm_session=${session}` } } : {}), env)).json()).tournament;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('fremd', 'fremd@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2199-01-01T00:00:00.000Z', '2026-09-01'),
             ('fremd-session', 'fremd', '2199-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, participants_public, created_at, updated_at, live_view_enabled)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'running', 'public', 1, '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation,
        registered_at, created_at, updated_at, live_token_hash)
      VALUES ('r1', 't1', 'Maria', 'Bieder', 'maria@example.test', 'confirmed', 'active', '2026-09-01', '2026-09-01', '2026-09-01', ?)`,
    await sha256Hex(TOKEN));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startet mit Endzeit und zeigt den Timer in Live-Ansicht, Spielplan und Turnier, mit neuem ETag', async () => {
    const liveVorher = await live();
    const liveEtag = liveVorher.headers.get('ETag');
    expect((await liveVorher.json()).timer).toBeNull();
    const planEtag = (await spielplan()).headers.get('ETag');

    const response = await steuern({ action: 'start', durationSec: 3000, label: '  Runde\n 3 ' });
    expect(response.status).toBe(200);
    const expected = { state: 'running', label: 'Runde 3', durationSec: 3000, endsAt: '2099-09-28T10:50:00.000Z' };
    expect(await response.json()).toEqual({ timer: expected, settings: { label: 'Runde 3', durationSec: 3000 }, revision: 1 });

    const liveNachher = await live(liveEtag);
    expect(liveNachher.status).toBe(200);
    expect((await liveNachher.json()).timer).toEqual(expected);
    const planNachher = await spielplan(planEtag);
    expect(planNachher.status).toBe(200);
    expect((await planNachher.json()).timer).toEqual(expected);
    expect((await turnier()).timer).toEqual(expected);
  });

  it('verliert bei gleichzeitigen Änderungen keine davon und zählt die Revision in Speicherreihenfolge', async () => {
    await steuern({ action: 'start', durationSec: 600 });
    const responses = await Promise.all([steuern({ action: 'adjust', deltaSec: 60 }), steuern({ action: 'adjust', deltaSec: 60 })]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await Promise.all(responses.map((response) => response.json()))).map((data) => data.revision).sort()).toEqual([2, 3]);
    expect((await turnier()).timer).toMatchObject({ endsAt: new Date(NOW + 720_000).toISOString() });
    expect((await (await steuern({ action: 'stop' })).json()).revision).toBe(4);
  });

  it('schickt bei einem Zustandskonflikt den aktuellen Timer mit', async () => {
    await steuern({ action: 'start', durationSec: 600, label: 'Runde 1' });
    await steuern({ action: 'stop' });
    const response = await steuern({ action: 'pause' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Der Timer läuft nicht.', details: { timer: null, revision: 2 } });

    await steuern({ action: 'start', durationSec: 300 });
    const resumed = await steuern({ action: 'resume' });
    expect(resumed.status).toBe(409);
    expect((await resumed.json()).details).toEqual({ timer: expect.objectContaining({ state: 'running', durationSec: 300 }), revision: 3 });
  });

  it('pausiert mit Restzeit, setzt fort, passt die Zeit an und stoppt mit Vorbelegung', async () => {
    await steuern({ action: 'start', durationSec: 600, label: 'Runde 1' });
    vi.setSystemTime(NOW + 100_000);

    expect((await (await steuern({ action: 'pause' })).json()).timer).toMatchObject({ state: 'paused', remainingSec: 500 });
    expect((await (await steuern({ action: 'adjust', deltaSec: 60 })).json()).timer).toMatchObject({ state: 'paused', remainingSec: 560 });

    vi.setSystemTime(NOW + 200_000);
    expect((await (await steuern({ action: 'resume' })).json()).timer)
      .toMatchObject({ state: 'running', endsAt: new Date(NOW + 200_000 + 560_000).toISOString() });
    expect((await (await steuern({ action: 'adjust', deltaSec: -60 })).json()).timer)
      .toMatchObject({ endsAt: new Date(NOW + 200_000 + 500_000).toISOString() });

    const gestoppt = await (await steuern({ action: 'stop' })).json();
    expect(gestoppt).toEqual({ timer: null, settings: { label: 'Runde 1', durationSec: 600 }, revision: expect.any(Number) });
    expect((await turnier()).timer).toBeNull();
    expect((await turnier('owner-session')).timerSettings).toEqual({ label: 'Runde 1', durationSec: 600 });
    expect((await turnier()).timerSettings).toBeUndefined();
  });

  it('lässt die Restzeit nicht unter 0 fallen', async () => {
    await steuern({ action: 'start', durationSec: 30 });
    expect((await (await steuern({ action: 'adjust', deltaSec: -60 })).json()).timer).toMatchObject({ endsAt: new Date(NOW).toISOString() });
  });

  it('prüft Rechte, Eingaben und Zustand', async () => {
    expect((await steuern({ action: 'start', durationSec: 60 }, 'fremd-session')).status).toBe(403);
    expect((await steuern({ action: 'start', durationSec: 0 })).status).toBe(400);
    expect((await steuern({ action: 'start', durationSec: 6000 })).status).toBe(400);
    expect((await steuern({ action: 'start', durationSec: 60, label: 'x'.repeat(61) })).status).toBe(400);
    expect((await steuern({ action: 'explodieren' })).status).toBe(400);
    expect((await steuern({ action: 'pause' })).status).toBe(409);
    expect((await steuern({ action: 'resume' })).status).toBe(409);
    expect((await steuern({ action: 'adjust', deltaSec: 60 })).status).toBe(409);
  });

  it('verschwindet mit dem Turnierende und ist danach gesperrt', async () => {
    await steuern({ action: 'start', durationSec: 600 });
    sql("UPDATE tournaments SET status = 'finished' WHERE id = 't1'");

    expect((await turnier()).timer).toBeNull();
    expect((await steuern({ action: 'start', durationSec: 600 })).status).toBe(409);
  });
});
