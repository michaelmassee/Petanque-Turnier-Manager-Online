// @vitest-environment node
// Ankündigung der Turnierleitung: Banner in Live-Ansicht und Turnierseite, Live-Push an Abonnenten.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const TOKEN = 'a'.repeat(64);

describe('Ankündigung der Turnierleitung', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const ankuendigen = (text, session = 'owner-session') => worker.fetch(new Request('https://ptm.test/api/tournaments/t1/announcement', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `ptm_session=${session}` }, body: JSON.stringify({ text }),
  }), env);
  const live = (etag) => worker.fetch(new Request(`https://ptm.test/api/live/token/${TOKEN}`, etag ? { headers: { 'If-None-Match': etag } } : {}), env);
  const turnierseite = async () => (await (await worker.fetch(new Request('https://ptm.test/api/tournaments/t1'), env)).json()).tournament;

  beforeEach(async () => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('fremd', 'fremd@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01'),
             ('fremd-session', 'fremd', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at, live_view_enabled)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'running', 'public', '2026-09-01', '2026-09-01', 1)`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, language,
        registered_at, created_at, updated_at, live_token_hash)
      VALUES ('r1', 't1', 'Maria', 'Bieder', 'maria@example.test', 'confirmed', 'active', 'fr', '2026-09-01', '2026-09-01', '2026-09-01', ?)`,
    await sha256Hex(TOKEN));
    sql(`INSERT INTO live_push_subscriptions (endpoint, registration_id, p256dh, auth, created_at, updated_at)
      VALUES ('https://push.example.test/1', 'r1', 'k', 'a', '2026-09-01', '2026-09-01')`);
  });

  it('zeigt die Ankündigung in der Live-Ansicht und auf der Turnierseite und ändert dabei das ETag', async () => {
    const vorher = await live();
    const etag = vorher.headers.get('ETag');
    expect((await vorher.json()).announcement).toBeNull();

    expect((await ankuendigen('  Mittagspause bis 13:00 Uhr  ')).status).toBe(200);

    const nachher = await live(etag);
    expect(nachher.status).toBe(200);
    expect((await nachher.json()).announcement).toMatchObject({ text: 'Mittagspause bis 13:00 Uhr', at: expect.any(String) });
    expect((await turnierseite()).announcement).toMatchObject({ text: 'Mittagspause bis 13:00 Uhr' });
  });

  it('schickt einen Live-Push in der Sprache des Spielers', async () => {
    await ankuendigen('Runde 4 startet um 13:15');

    const items = env.MAIL_QUEUE.sendBatch.mock.calls.flatMap(([batch]) => batch.flatMap((message) => message.body.items));
    expect(items).toEqual([expect.objectContaining({
      endpoint: 'https://push.example.test/1',
      payload: expect.objectContaining({ title: 'Herbstturnier: Annonce', body: 'Runde 4 startet um 13:15', tag: 'live-announcement' }),
    })]);
  });

  it('löscht mit leerem Text, ohne Push', async () => {
    await ankuendigen('Mittagspause');
    env.MAIL_QUEUE.sendBatch.mockClear();

    await ankuendigen('');

    expect((await turnierseite()).announcement).toBeNull();
    expect(env.MAIL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('verschwindet mit dem Turnierende und ist danach gesperrt', async () => {
    await ankuendigen('Siegerehrung um 18 Uhr');
    sql("UPDATE tournaments SET status = 'finished' WHERE id = 't1'");

    expect((await turnierseite()).announcement).toBeNull();
    expect((await ankuendigen('Noch etwas')).status).toBe(409);
  });

  it('darf nur die Turnierleitung setzen und höchstens 300 Zeichen lang sein', async () => {
    expect((await ankuendigen('Hallo', 'fremd-session')).status).toBe(403);
    expect((await ankuendigen('x'.repeat(301))).status).toBe(400);
  });
});
