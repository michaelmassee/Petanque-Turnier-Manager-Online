// @vitest-environment node
// Turnier aus dem Turnierdokument abschließen: Status „abgeschlossen“, auf Wunsch die zuletzt übertragene
// Dokument-Rangliste als Endrangliste veröffentlichen und die Teilnehmer einmalig per Mail benachrichtigen.
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker from './worker.js';

describe('Turnier aus dem Turnierdokument abschließen', () => {
  const PTM_ZUGANG = 'e2e-api-key-mit-ausreichender-laenge';
  const ANNA = '11111111-1111-4111-8111-aaaaaaaaaaaa';
  const BERT = '22222222-2222-4222-8222-bbbbbbbbbbbb';
  let env;
  let send;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const turnier = () => env.DB.sqlite.prepare('SELECT status, final_ranking_published_at FROM tournaments WHERE id = ?').get('t1');
  const endrangliste = () => env.DB.sqlite.prepare('SELECT ranking_json, mailed_at FROM tournament_final_rankings WHERE tournament_id = ?').get('t1');
  const mails = () => send.mock.calls.map(([payload]) => payload).filter((payload) => payload.to);
  const sync = (method, path, body) => {
    const request = syncAnfrage(method, `/api/sync/tournaments/t1${path}`, body);
    request.headers.set('Authorization', `Bearer ${PTM_ZUGANG}`);
    return worker.fetch(request, env);
  };
  const abschliessen = (body) => sync('POST', '/finish', body);
  const ranglisteUebertragen = () => sync('PUT', '/ranking', {
    entries: [{ place: 1, registrationIds: [ANNA], wins: 1 }, { place: 2, registrationIds: [BERT], wins: 0 }],
  });

  beforeEach(() => {
    send = vi.fn(async () => {});
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, mail_enabled, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', 1, '2026-01-01', '2026-01-01'),
             ('bert', 'bert@example.test', 'user', 'salt', 'hash', 1, '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, approved_at, created_at, updated_at)
      VALUES ('key1', 'owner', ?, 'PTM', 'approved', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')`,
    createHash('sha256').update(PTM_ZUGANG).digest('hex'));
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status, visibility,
      desktop_execution, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-09-28', 'Ort', 'tete', 'forme', 'schweizer', 'running', 'public', 1,
        '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at, user_id)
      VALUES (?, 't1', 'Anna', 'A', 'anna@example.test', 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01', NULL),
             (?, 't1', 'Bert', 'B', 'bert@example.test', 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01', 'bert')`,
    ANNA, BERT);
    bindeDokument(env.DB.sqlite, 't1');
  });

  it('setzt das Turnier auf abgeschlossen und benachrichtigt Leitung und Teilnehmer mit Konto', async () => {
    const antwort = await abschliessen({});

    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toMatchObject({ finished: true, rankingPublished: false, mailed: false, alreadyMailed: false });
    expect(antwort.headers.get('X-PTM-Tournament-Status')).toBe('finished');
    expect(turnier()).toEqual({ status: 'finished', final_ranking_published_at: null });
    expect(endrangliste()).toBeUndefined();
    const statusMeldungen = env.DB.sqlite.prepare(`SELECT recipient_id FROM postbox_messages
        WHERE event_type = 'tournament_status_changed' ORDER BY recipient_id`).all();
    expect(statusMeldungen.map((zeile) => zeile.recipient_id)).toEqual(['bert', 'owner']);
    expect(mails()).toEqual([]);
  });

  it('veröffentlicht die zuletzt aus dem Dokument übertragene Rangliste als Endrangliste', async () => {
    expect((await ranglisteUebertragen()).status).toBe(200);

    const antwort = await abschliessen({ publishRanking: true });

    expect(await antwort.json()).toMatchObject({ rankingPublished: true, mailed: false });
    expect(turnier().final_ranking_published_at).toEqual(expect.any(String));
    const eingefroren = JSON.parse(endrangliste().ranking_json);
    expect(eingefroren.map((eintrag) => eintrag.rank)).toEqual([1, 2]);
    const oeffentlich = await (await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/ranking'), env)).json();
    expect(oeffentlich.publishedAt).toEqual(expect.any(String));
    expect(oeffentlich.ranking).toHaveLength(2);
  });

  it('schreibt die Teilnehmer beim ersten Abschluss an, bei einem erneuten Abschluss nicht noch einmal', async () => {
    await ranglisteUebertragen();

    const erster = await (await abschliessen({ publishRanking: true, notify: true })).json();
    expect(erster).toMatchObject({ mailed: true, alreadyMailed: false });
    expect(mails().map((mail) => mail.to).sort()).toEqual(['anna@example.test', 'bert@example.test']);
    expect(mails()[0].subject).toBe('Endrangliste: Herbstturnier');
    expect(endrangliste().mailed_at).toEqual(expect.any(String));

    send.mockClear();
    const zweiter = await (await abschliessen({ publishRanking: true, notify: true })).json();
    expect(zweiter).toMatchObject({ rankingPublished: true, mailed: false, alreadyMailed: true });
    expect(mails()).toEqual([]);
  });

  it('lehnt die Veröffentlichung ohne übertragene Rangliste ab und lässt das Turnier unverändert', async () => {
    const antwort = await abschliessen({ publishRanking: true });

    expect(antwort.status).toBe(409);
    expect((await antwort.json()).details).toMatchObject({ code: 'ranking_missing' });
    expect(turnier().status).toBe('running');
  });

  it('verlangt bei einem privaten Turnier vor dem Versand den Freigabelink', async () => {
    await ranglisteUebertragen();
    sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");

    const antwort = await abschliessen({ publishRanking: true, notify: true });

    expect(antwort.status).toBe(409);
    expect((await antwort.json()).details).toMatchObject({ code: 'share_link_missing' });
    expect(turnier().status).toBe('running');
    expect(mails()).toEqual([]);
  });

  it('erlaubt die spätere Wiederaufnahme per Rundenstart aus dem Dokument', async () => {
    await abschliessen({});

    expect((await sync('POST', '/start', {})).status).toBe(200);

    expect(turnier().status).toBe('running');
  });
});
