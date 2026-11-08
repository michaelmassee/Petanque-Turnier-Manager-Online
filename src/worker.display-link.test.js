// @vitest-environment node
// Anzeige-Schlüssel der Turnierseite: nur die Turnierleitung bekommt ihn; er öffnet Spielplan und Turnier auch ohne
// veröffentlichte Teilnehmerliste, aber keine Anmeldung.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

describe('Anzeige-Link der Turnierseite', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const web = (method, path, session) => worker.fetch(new Request(`https://ptm.test${path}`, {
    method, headers: session ? { Cookie: `ptm_session=${session}` } : {},
  }), env);
  const schluesselHolen = async (session = 'owner-session') => (await (await web('POST', '/api/tournaments/t1/display-link', session)).json()).displayToken;

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: () => {} } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('player', 'spieler@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('player-session', 'player', '2099-01-01T00:00:00.000Z', '2026-01-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, participants_public, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'running', 'public', 0, '2026-09-01', '2026-09-01')`);
  });

  it('gibt den Schlüssel nur der Turnierleitung, immer denselben', async () => {
    expect((await web('POST', '/api/tournaments/t1/display-link')).status).toBe(401);
    expect((await web('POST', '/api/tournaments/t1/display-link', 'player-session')).status).toBe(403);

    const schluessel = await schluesselHolen();
    expect(schluessel).toMatch(/^[0-9a-f]{64}$/);
    expect(await schluesselHolen()).toBe(schluessel);
  });

  it.each(['public', 'private'])('öffnet den Spielplan ohne veröffentlichte Teilnehmerliste (%s)', async (visibility) => {
    sql('UPDATE tournaments SET visibility = ? WHERE id = ?', visibility, 't1');
    const schluessel = await schluesselHolen();

    expect((await web('GET', '/api/tournaments/t1/schedule')).status).toBe(403);
    expect((await web('GET', '/api/tournaments/t1/schedule?share=falsch')).status).toBe(403);
    expect((await web('GET', `/api/tournaments/t1/schedule?share=${schluessel}`)).status).toBe(200);
    expect((await web('GET', `/api/tournaments/t1?share=${schluessel}`)).status).toBe(200);
  });

  it('gibt den Schlüssel nicht in der Turnier-Antwort heraus', async () => {
    const schluessel = await schluesselHolen();
    const body = await (await web('GET', `/api/tournaments/t1?share=${schluessel}`)).text();
    expect(body).not.toContain(schluessel);
  });

  it('schaltet bei privaten Turnieren weder Anmeldung noch QR-Weiterleitung frei', async () => {
    sql("UPDATE tournaments SET visibility = 'private', status = 'registration' WHERE id = 't1'");
    const schluessel = await schluesselHolen();

    const anmeldung = await worker.fetch(new Request(`https://ptm.test/api/tournaments/t1/registrations?share=${schluessel}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Fremd', lastName: 'Person', playerEmail: 'fremd@example.test', shareToken: schluessel,
        publicationNoticeAccepted: true, personsConsentAccepted: true, feeSelections: [], registrationAnswers: [] }),
    }), env);
    expect(anmeldung.status).toBeGreaterThanOrEqual(400);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tournament_share_links').get().n).toBe(0);
  });
});
