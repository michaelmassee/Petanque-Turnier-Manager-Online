// @vitest-environment node
// Turnieroptionen in tournament_options (Migration 0164): tournaments steht am D1-Limit von 100 Ergebnisspalten.
// Erste Option: Ergebnismeldungen von Spielern erst nach Bestätigung veröffentlichen (E-27, Standard: aus).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker from './worker.js';

const ORIGIN = 'https://ptm.test';
const BODY = { name: 'Turnier', date: '2099-12-01', location: 'Ort', type: 'schweizer', formation: 'doublette', registrationType: 'forme',
  status: 'draft', visibility: 'private', liveViewEnabled: true, playerResultReportingEnabled: true };

describe('Turnieroptionen (tournament_options)', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const stored = (id) => env.DB.sqlite.prepare('SELECT result_report_confirmation_required AS value FROM tournament_options WHERE tournament_id = ?').get(id)?.value;
  const request = (path, init = {}, session = 'leitung-session') => worker.fetch(new Request(`${ORIGIN}${path}`, {
    ...init, headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' },
  }), env);
  const create = async (body) => (await (await request('/api/tournaments', { method: 'POST', body: JSON.stringify({ ...BODY, ...body }) })).json()).tournament;
  const update = (id, body) => request(`/api/tournaments/${id}`, { method: 'PUT', body: JSON.stringify({ ...BODY, ...body }) });
  const settings = async (id, session) => (await request(`/api/tournaments/${id}/settings`, {}, session));

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('leitung', 'leitung@example.test', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01'),
             ('fremd', 'fremd@example.test', 'user', 'salt', 'hash', '2026-10-01', '2026-10-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('leitung-session', 'leitung', '2099-01-01T00:00:00.000Z', '2026-10-01'),
             ('fremd-session', 'fremd', '2099-01-01T00:00:00.000Z', '2026-10-01')`);
  });

  it('liefert ohne gespeicherte Zeile den Standard: Meldungen werden sofort übernommen', async () => {
    const tournament = await create({});
    expect(stored(tournament.id)).toBeUndefined();
    expect(await (await settings(tournament.id)).json()).toEqual({ resultReportConfirmationRequired: false });
  });

  it('speichert die Option beim Anlegen und Bearbeiten und lädt sie fürs Formular', async () => {
    const tournament = await create({ resultReportConfirmationRequired: true });
    expect(stored(tournament.id)).toBe(1);
    expect(await (await settings(tournament.id)).json()).toEqual({ resultReportConfirmationRequired: true });

    expect((await update(tournament.id, { resultReportConfirmationRequired: false })).status).toBe(200);
    expect(stored(tournament.id)).toBe(0);
  });

  it('lässt den gespeicherten Wert stehen, wenn ein Update die Option nicht mitschickt', async () => {
    const tournament = await create({ resultReportConfirmationRequired: true });
    expect((await update(tournament.id, {})).status).toBe(200);
    expect(stored(tournament.id)).toBe(1);
  });

  it('erzwingt „aus“, wenn die Ergebnismeldung durch Spieler abgeschaltet ist', async () => {
    const tournament = await create({ playerResultReportingEnabled: false, resultReportConfirmationRequired: true });
    expect(stored(tournament.id)).toBe(0);
  });

  it('kopiert die Option mit dem Turnier', async () => {
    const tournament = await create({ resultReportConfirmationRequired: true });
    const copy = await request(`/api/tournaments/${tournament.id}/duplicate`, { method: 'POST' });
    expect(copy.status).toBe(201);
    expect(stored((await copy.json()).tournament.id)).toBe(1);
  });

  it('zeigt die Optionen nur Verwaltenden', async () => {
    const tournament = await create({});
    expect((await settings(tournament.id, 'fremd-session')).status).toBe(403);
  });
});
