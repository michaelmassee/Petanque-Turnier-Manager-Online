// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker from './worker.js';

// Ergebnismeldungen von Spielern bei einem Turnier, das im Turnierdokument geführt wird (E-27, E-28): Sie warten als
// offene Meldung, bis die Turnierleitung sie im Dokument übernimmt oder verwirft.
describe('Ergebnismeldung bei verbundenem Turnierdokument', () => {
  const PTM_ZUGANG = 'e2e-api-key-mit-ausreichender-laenge';
  const ANNA = '11111111-1111-4111-8111-aaaaaaaaaaaa';
  const BERT = '22222222-2222-4222-8222-bbbbbbbbbbbb';
  const rundeMit = (scoreA, scoreB) => ({ matches: [{ teamA: [ANNA], teamB: [BERT], scoreA, scoreB }] });
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const meldungen = () => env.DB.sqlite.prepare('SELECT score_a, score_b, status FROM document_result_reports ORDER BY created_at').all();
  const melden = (session, registrationId, ownScore, opponentScore) => worker.fetch(new Request(
    `https://ptm.test/api/live/registrations/${registrationId}/result`, {
      method: 'POST', headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownScore, opponentScore }),
    }), env);
  const live = async (session, registrationId) => (await worker.fetch(new Request(
    `https://ptm.test/api/live/registrations/${registrationId}`, { headers: { Cookie: `ptm_session=${session}` } }), env)).json();
  const sync = (method, path, body) => {
    const request = syncAnfrage(method, `/api/sync/tournaments/t1${path}`, body);
    request.headers.set('Authorization', `Bearer ${PTM_ZUGANG}`);
    return worker.fetch(request, env);
  };
  const offeneMeldungen = async () => (await (await sync('GET', '/result-reports')).json()).reports;

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('anna', 'anna@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01'),
             ('bert', 'bert@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('anna-session', 'anna', '2099-01-01T00:00:00.000Z', '2026-01-01'),
             ('bert-session', 'bert', '2099-01-01T00:00:00.000Z', '2026-01-01')`);
    sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, approved_at, created_at, updated_at)
      VALUES ('key1', 'owner', ?, 'PTM', 'approved', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')`,
    createHash('sha256').update(PTM_ZUGANG).digest('hex'));
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status, visibility,
      live_view_enabled, player_result_reporting_enabled, desktop_execution, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'tete', 'forme', 'schweizer', 'running', 'public', 1, 1, 1,
        '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, user_id)
      VALUES ('11111111-1111-4111-8111-aaaaaaaaaaaa', 't1', 'Anna', 'A', 'anna@example.test', 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01', 'anna'),
             ('22222222-2222-4222-8222-bbbbbbbbbbbb', 't1', 'Bert', 'B', 'bert@example.test', 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01', 'bert')`);
    bindeDokument(env.DB.sqlite, 't1');
    sql("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('round1', 't1', 1, '2026-01-01')");
    sql(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, created_at, updated_at)
      VALUES ('match1', 't1', 'round1', ?, ?, '2026-01-01', '2026-01-01')`,
    JSON.stringify([ANNA]), JSON.stringify([BERT]));
  });

  it('speichert die Meldung aus Sicht von Team B richtig herum und lässt die Partie unverändert', async () => {
    expect((await melden('bert-session', BERT, 13, 7)).status).toBe(200);

    expect(meldungen()).toEqual([{ score_a: 7, score_b: 13, status: 'open' }]);
    expect(env.DB.sqlite.prepare("SELECT score_a, score_b FROM tournament_matches WHERE id = 'match1'").get())
      .toEqual({ score_a: null, score_b: null });
  });

  it('nimmt nur die Meldung des Siegerteams an', async () => {
    const verlierer = await melden('anna-session', ANNA, 7, 13);

    expect(verlierer.status).toBe(400);
    expect((await verlierer.json()).details).toEqual({ code: 'winner_reports_only' });
    expect(meldungen()).toEqual([]);
  });

  it('lässt keine zweite offene Meldung derselben Partie zu', async () => {
    await melden('bert-session', BERT, 13, 7);

    expect((await melden('anna-session', ANNA, 13, 7)).status).toBe(409);
    expect(meldungen()).toHaveLength(1);
  });

  it('nimmt ohne eingeschaltete Ergebnismeldung oder ohne aktuelle Dokumentbindung nichts an', async () => {
    sql("UPDATE tournaments SET player_result_reporting_enabled = 0 WHERE id = 't1'");
    expect((await melden('anna-session', ANNA, 13, 7)).status).toBe(403);

    // Ohne freigeschaltete Live-Ansicht gilt auch eine gespeicherte Ergebnismeldung nicht.
    sql("UPDATE tournaments SET player_result_reporting_enabled = 1, live_view_enabled = 0 WHERE id = 't1'");
    expect((await melden('anna-session', ANNA, 13, 7)).status).toBe(403);

    sql("UPDATE tournaments SET live_view_enabled = 1, player_result_reporting_enabled = 1, sync_document_id = NULL, document_managed = 0 WHERE id = 't1'");
    expect((await melden('anna-session', ANNA, 13, 7)).status).toBe(409);
    expect(meldungen()).toEqual([]);
  });

  it('zeigt beiden Teams die offene Meldung aus der eigenen Sicht', async () => {
    await melden('bert-session', BERT, 13, 7);

    expect((await live('anna-session', ANNA)).registration.resultReport).toEqual({ ownScore: 7, opponentScore: 13, status: 'open' });
    expect((await live('bert-session', BERT)).registration.resultReport).toEqual({ ownScore: 13, opponentScore: 7, status: 'open' });
    expect((await live('bert-session', BERT)).tournament).toMatchObject({ resultReportingViaDocument: true });
  });

  it('liefert dem Dokument die offenen Meldungen mit Meldendem, nur bei eingeschalteter Ergebnismeldung', async () => {
    await melden('bert-session', BERT, 13, 7);

    expect(await offeneMeldungen()).toEqual([expect.objectContaining({
      roundNumber: 1, teamA: [ANNA], teamB: [BERT], scoreA: 7, scoreB: 13, reportedBy: 'Bert B',
    })]);
    sql("UPDATE tournaments SET player_result_reporting_enabled = 0 WHERE id = 't1'");
    expect(await (await sync('GET', '/result-reports')).json()).toEqual({ enabled: false, status: 'running', reports: [] });
  });

  it('verwirft eine Meldung auf Entscheidung des Dokuments; danach darf das Team erneut melden', async () => {
    await melden('bert-session', BERT, 13, 7);
    const [meldung] = await offeneMeldungen();

    const antwort = await sync('POST', '/result-reports/decisions', { decisions: [{ id: meldung.id, decision: 'dismissed' }] });

    expect(antwort.status).toBe(200);
    expect(meldungen()).toEqual([{ score_a: 7, score_b: 13, status: 'dismissed' }]);
    expect((await live('bert-session', BERT)).registration.resultReport).toMatchObject({ status: 'dismissed' });
    expect((await melden('bert-session', BERT, 13, 9)).status).toBe(200);
  });

  it('erledigt offene Meldungen, sobald das Dokument ein Ergebnis überträgt oder die Runde löscht', async () => {
    await melden('bert-session', BERT, 13, 7);

    await sync('PUT', '/rounds/1', rundeMit(null, null));
    expect(meldungen()).toEqual([{ score_a: 7, score_b: 13, status: 'open' }]);

    await sync('PUT', '/rounds/1', rundeMit(7, 13));
    expect(meldungen()).toEqual([{ score_a: 7, score_b: 13, status: 'superseded' }]);

    await sync('PUT', '/rounds/1', rundeMit(null, null));
    await melden('anna-session', ANNA, 13, 5);
    await sync('DELETE', '/rounds/1');
    expect(meldungen().map((zeile) => zeile.status)).toEqual(['superseded', 'superseded']);
  });

  it('meldet bei jeder Sync-Antwort Schalter und Zahl der offenen Meldungen (Huckepack)', async () => {
    await melden('bert-session', BERT, 13, 7);

    const antwort = await sync('PUT', '/rounds/1', rundeMit(null, null));

    expect(antwort.headers.get('X-PTM-Result-Reporting')).toBe('1');
    expect(antwort.headers.get('X-PTM-Open-Result-Reports')).toBe('1');
  });
});
