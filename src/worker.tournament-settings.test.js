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

  // Sonst könnte eine Spielermeldung zwischen den beiden Schreibvorgängen den Standard sehen und sofort öffentlich werden.
  it('schaltet Ergebnismeldung und Bestätigungspflicht in einem Schritt ein', async () => {
    const tournament = await create({ playerResultReportingEnabled: false });
    const sichtbar = [];
    const zustand = () => sichtbar.push(env.DB.sqlite.prepare(`SELECT t.player_result_reporting_enabled AS meldung,
        COALESCE(o.result_report_confirmation_required, 0) AS bestaetigung
      FROM tournaments t LEFT JOIN tournament_options o ON o.tournament_id = t.id WHERE t.id = ?`).get(tournament.id));
    // Jeden Schreibvorgang außerhalb eines Batches und jeden Batch als Ganzes beobachten.
    const prepare = env.DB.prepare.bind(env.DB);
    const beobachten = (statement) => ({ ...statement, bind: (...values) => beobachten(statement.bind(...values)),
      run: async () => { const result = await statement.run(); zustand(); return result; } });
    env.DB.prepare = (statementSql) => beobachten(prepare(statementSql));
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = async (statements) => { const result = await batch(statements); zustand(); return result; };

    expect((await update(tournament.id, { resultReportConfirmationRequired: true })).status).toBe(200);
    expect(sichtbar.at(-1)).toEqual({ meldung: 1, bestaetigung: 1 });
    expect(sichtbar).not.toContainEqual({ meldung: 1, bestaetigung: 0 });
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

  describe('Live-Ansicht und Ergebnismeldung in der Spielverwaltung (PUT …/options)', () => {
    const putOptions = (id, body) => request(`/api/tournaments/${id}/options`, { method: 'PUT', body: JSON.stringify(body) });
    const flags = (id) => env.DB.sqlite.prepare('SELECT live_view_enabled AS live, player_result_reporting_enabled AS meldung FROM tournaments WHERE id = ?').get(id);

    it('setzt alle drei Einstellungen und liefert den Stand zurück', async () => {
      const tournament = await create({ liveViewEnabled: false, playerResultReportingEnabled: false });
      const response = await putOptions(tournament.id, { liveViewEnabled: true, playerResultReportingEnabled: true, resultReportConfirmationRequired: true });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ liveViewEnabled: true, playerResultReportingEnabled: true, resultReportConfirmationRequired: true });
      expect(flags(tournament.id)).toEqual({ live: 1, meldung: 1 });
      expect(stored(tournament.id)).toBe(1);
    });

    it('schaltet mit der Live-Ansicht die Ergebnismeldung und die Bestätigungspflicht ab', async () => {
      const tournament = await create({ resultReportConfirmationRequired: true });
      expect((await putOptions(tournament.id, { liveViewEnabled: false, playerResultReportingEnabled: true, resultReportConfirmationRequired: true })).status).toBe(200);
      expect(flags(tournament.id)).toEqual({ live: 0, meldung: 0 });
      expect(stored(tournament.id)).toBe(0);
      // Nur die Live-Ansicht mitgeschickt: Die Ergebnismeldung bleibt aus, solange die Live-Ansicht aus ist.
      expect((await putOptions(tournament.id, { playerResultReportingEnabled: true })).status).toBe(200);
      expect(flags(tournament.id)).toEqual({ live: 0, meldung: 0 });
    });

    it('lässt bei Trip-Tête keine Ergebnismeldung zu', async () => {
      const tournament = await create({ type: 'trip_tete', formation: 'triplette', liveViewEnabled: false, playerResultReportingEnabled: false });
      expect((await putOptions(tournament.id, { liveViewEnabled: true, playerResultReportingEnabled: true })).status).toBe(200);
      expect(flags(tournament.id)).toEqual({ live: 1, meldung: 0 });
    });

    it('lehnt ungültige Werte und beendete Turniere ab', async () => {
      const tournament = await create({});
      expect((await putOptions(tournament.id, { liveViewEnabled: 'ja' })).status).toBe(400);
      expect((await putOptions(tournament.id, { resultReportConfirmationRequired: 1 })).status).toBe(400);
      sql("UPDATE tournaments SET status = 'finished' WHERE id = ?", tournament.id);
      expect((await putOptions(tournament.id, { liveViewEnabled: false })).status).toBe(409);
    });

    it('das Turnierformular ohne die Felder lässt sie stehen; ein Wechsel auf Trip-Tête schaltet die Meldung ab', async () => {
      const tournament = await create({});
      const { liveViewEnabled, playerResultReportingEnabled, ...withoutLive } = BODY;
      expect(liveViewEnabled && playerResultReportingEnabled).toBe(true);
      const formUpdate = (body) => request(`/api/tournaments/${tournament.id}`, { method: 'PUT', body: JSON.stringify({ ...withoutLive, ...body }) });
      expect((await formUpdate({ name: 'Umbenannt' })).status).toBe(200);
      expect(flags(tournament.id)).toEqual({ live: 1, meldung: 1 });
      expect((await formUpdate({ type: 'trip_tete', formation: 'triplette' })).status).toBe(200);
      expect(flags(tournament.id)).toEqual({ live: 1, meldung: 0 });
    });
  });

  it('zeigt die Optionen nur Verwaltenden', async () => {
    const tournament = await create({});
    expect((await settings(tournament.id, 'fremd-session')).status).toBe(403);
  });
});
