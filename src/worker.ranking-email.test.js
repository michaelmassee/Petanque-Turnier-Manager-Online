// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRankingPdfAttachment } from './lib/ranking-pdf.js';
import worker, { deleteUser, getTournamentById, prepareTournamentRankingEmail, purgeExpiredPersonalData, requestTournamentRankingEmail as requestRankingEmail, updateTournamentPublication } from './worker.js';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';

function extractPdf(attachment, bbox = false) {
  const directory = mkdtempSync(join(tmpdir(), 'ptm-ranking-pdf-test-'));
  const input = join(directory, 'ranking.pdf');
  try {
    writeFileSync(input, Buffer.from(attachment.content, 'base64'));
    const result = spawnSync('pdftotext', [bbox ? '-bbox' : '-layout', input, '-'], {
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error?.code === 'ENOENT') throw new Error('PDF tests require pdftotext (Poppler/poppler-utils).', { cause: result.error });
    if (result.error) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  } finally {
    unlinkSync(input);
    rmdirSync(directory);
  }
}

function pdfPages(attachment) {
  return [...extractPdf(attachment, true).matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((page) =>
    [...page[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((word) => ({ x: Number(word[1]), y: Number(word[2]), right: Number(word[3]), bottom: Number(word[4]), text: word[5] })));
}

// Browser-Ablauf: Daten erst auf Nachfrage laden, PDF lokal erzeugen und hochladen.
async function requestTournamentRankingEmail(env, tournament, user) {
  const prepared = await prepareTournamentRankingEmail(env, tournament, user);
  const document = prepared.sent ? {} : { revision: prepared.revision, attachments: Object.fromEntries(prepared.languages.map((language) => [
    language, createRankingPdfAttachment(prepared.tournament, prepared.ranking, language),
  ])) };
  return requestRankingEmail(env, tournament, user, document);
}

describe('Einmaliger Versand der Endrangliste', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const tournament = () => getTournamentById(env.DB, 't1');
  const queuedMessages = () => env.MAIL_QUEUE.sendBatch.mock.calls.flatMap(([messages]) => messages.map((message) => message.body));
  const rankingNotifications = () => env.DB.sqlite.prepare("SELECT recipient_id FROM postbox_messages WHERE event_type = 'tournament_ranking_email_available' ORDER BY recipient_id").all().map((row) => row.recipient_id);

  function prepareSync(protocol = 1) {
    bindeDokument(env.DB.sqlite, 't1', { protocol });
    sql("INSERT INTO api_keys (id, user_id, label, key_hash, status, requested_at, created_at, updated_at) VALUES ('key', 'owner', 'Test', ?, 'approved', '2026-01-01', '2026-01-01', '2026-01-01')", createHash('sha256').update('test-ranking-key').digest('hex'));
  }

  async function sync(path, body, options = {}) {
    const request = syncAnfrage('PUT', `/api/sync/tournaments/t1/${path}`, body, options);
    request.headers.set('Authorization', 'Bearer test-ranking-key');
    const response = await worker.fetch(request, env, { waitUntil: vi.fn() });
    expect(response.status, await response.clone().text()).toBe(200);
    return response;
  }

  const metadata = (status) => ({ name: 'Herbstpokal', date: '2026-10-12', location: 'Bouleplatz', formation: 'doublette', type: 'rangliste', registrationType: 'forme', status, visibility: 'public', latitude: 50.94, longitude: 6.96 });
  const rankingBody = { entries: [{ place: 1, registrationIds: ['r1'], wins: 3, pointsFor: 39, pointsAgainst: 12 }] };

  async function sentPdf() {
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await worker.queue({ messages: [{ body: queuedMessages()[0], ack: vi.fn(), retry: vi.fn() }] }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    return JSON.parse(fetchMock.mock.calls[0][1].body).attachments[0];
  }

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, mail_enabled, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', 1, '2026-01-01', '2026-01-01'),
             ('editor', 'bearbeitung@example.test', 'user', 'salt', 'hash', 1, '2026-01-01', '2026-01-01'),
             ('admin', 'admin@example.test', 'admin', 'salt', 'hash', 1, '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, type, status, visibility, desktop_execution, desktop_ranking_json, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstpokal', '2026-10-12', 'Bouleplatz', 'doublette', 'rangliste', 'finished', 'public', 1,
       '[{"rank":1,"registrationIds":["r1"],"wins":3,"pointsFor":39,"pointsAgainst":12,"pointsDiff":27}]', '2026-01-01', '2026-01-01')`);
    sql("INSERT INTO tournament_editors (id, tournament_id, user_id, granted_by, created_at) VALUES ('te1', 't1', 'editor', 'owner', '2026-01-01')");
    sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, partner_email, status, participation, language, registered_at, created_at, updated_at)
      VALUES ('r1', 't1', 'Anna', 'Adler', 'Anna@Example.test', 'partner@example.test', 'confirmed', 'active', 'fr', '2026-01-01', '2026-01-01', '2026-01-01'),
             ('r2', 't1', 'Inaktiv', 'Igel', 'inactive@example.test', NULL, 'confirmed', 'inactive', 'de', '2026-01-01', '2026-01-01', '2026-01-01'),
             ('r3', 't1', 'Warte', 'Liste', 'waitlist@example.test', NULL, 'waitlist', 'active', 'de', '2026-01-01', '2026-01-01', '2026-01-01')`);
  });

  it('sendet nur einmal, einzeln und nur an aktive bestätigte Teamadressen', async () => {
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    await requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });

    expect(queuedMessages()).toEqual([
      expect.objectContaining({ kind: 'tournament_ranking_pdf', tournamentId: 't1', email: 'anna@example.test', language: 'fr' }),
      expect.objectContaining({ kind: 'tournament_ranking_pdf', tournamentId: 't1', email: 'partner@example.test', language: 'fr' }),
    ]);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_dispatches').get().count).toBe(1);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries').get().count).toBe(2);
  });

  it('liefert die Vorbereitung nur angemeldeten berechtigten Leitungen und reiht beim GET nichts ein', async () => {
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('owner-session', 'owner', '2099-01-01', '2026-01-01'), ('admin-session', 'admin', '2099-01-01', '2026-01-01')");
    const path = 'https://ptm.test/api/tournaments/t1/ranking-email';
    expect((await worker.fetch(new Request(path), env)).status).toBe(401);
    expect((await worker.fetch(new Request(path, { headers: { Cookie: 'ptm_session=admin-session' } }), env)).status).toBe(403);
    const response = await worker.fetch(new Request(path, { headers: { Cookie: 'ptm_session=owner-session' } }), env);
    expect(response.status).toBe(200);
    const prepared = await response.json();
    expect(prepared).toMatchObject({ tournament: { name: 'Herbstpokal' }, languages: ['fr'] });
    expect(prepared.ranking[0].label).toContain('Anna Adler');
    expect(queuedMessages()).toHaveLength(0);
    const attachments = { fr: createRankingPdfAttachment(prepared.tournament, prepared.ranking, 'fr') };
    const sent = await worker.fetch(new Request(path, { method: 'POST', headers: { Cookie: 'ptm_session=owner-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: prepared.revision, attachments }) }), env);
    expect(sent.status).toBe(200);
    expect(queuedMessages()).toHaveLength(2);
  });

  it.each([
    undefined,
    { filename: 'evil.txt', content: btoa('%PDF-1.3\n%%EOF') },
    { filename: 'rangliste.pdf', content: 'not-base64' },
    { filename: 'rangliste.pdf', content: btoa('not a PDF\n%%EOF') },
    { filename: 'rangliste.pdf', content: btoa('%PDF-1.3\nincomplete') },
    { filename: 'rangliste.pdf', content: 'A'.repeat(174_768) },
  ])('sperrt ungültige Browser-Anhänge ohne den einmaligen Auftrag zu verbrauchen (%#)', async (attachment) => {
    const prepared = await prepareTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    await expect(requestRankingEmail(env, await tournament(), { id: 'owner', role: 'user' }, { revision: prepared.revision, attachments: { fr: attachment } })).rejects.toMatchObject({ status: 400 });
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_dispatches').get().count).toBe(0);
    expect(queuedMessages()).toHaveLength(0);
  });

  it('weist einen veralteten Browser-Snapshot zurück und erlaubt danach die aktuelle Fassung', async () => {
    const user = { id: 'owner', role: 'user' };
    const prepared = await prepareTournamentRankingEmail(env, await tournament(), user);
    const attachments = { fr: createRankingPdfAttachment(prepared.tournament, prepared.ranking, 'fr') };
    sql("UPDATE registrations SET first_name = 'Geändert' WHERE id = 'r1'");
    await expect(requestRankingEmail(env, await tournament(), user, { revision: prepared.revision, attachments })).rejects.toMatchObject({ status: 409 });
    expect(queuedMessages()).toHaveLength(0);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_dispatches').get().count).toBe(0);
    await requestTournamentRankingEmail(env, await tournament(), user);
    expect(queuedMessages()).toHaveLength(2);
  });

  it('fährt nach einem fehlgeschlagenen Queue-Block mit dem nächsten Block fort', async () => {
    for (let index = 0; index < 100; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, registered_at, created_at, updated_at)
        VALUES (?, 't1', 'Batch', 'Test', ?, 'confirmed', 'active', '2026-01-01', '2026-01-01', '2026-01-01')`, `batch-${index}`, `batch-${index}@example.test`);
    }
    env.MAIL_QUEUE.sendBatch.mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValueOnce();
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledTimes(2);
    expect(env.MAIL_QUEUE.sendBatch.mock.calls.map(([messages]) => messages.length)).toEqual([100, 2]);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries').get().count).toBe(102);
    await requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledTimes(2);
  });

  it('loggt Einreihfehler still, fährt mit weiteren Adressen fort und wiederholt den Auftrag nicht', async () => {
    env.MAIL_QUEUE.sendBatch.mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' })).resolves.toMatchObject({ status: 200 });
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledOnce();
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_dispatches').get().count).toBe(1);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries').get().count).toBe(2);
    await expect(requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' })).resolves.toMatchObject({ status: 200 });
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledOnce();
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM postbox_messages WHERE event_type = 'tournament_ranking_email_failed'").get().count).toBe(0);
  });

  it('reiht über 500 Adressen in Blöcken unter dem D1-Parameterlimit ein', async () => {
    for (let index = 0; index < 599; index += 1) {
      sql(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email, status, participation, language, registered_at, created_at, updated_at)
        VALUES (?, 't1', 'Batch', ?, ?, 'confirmed', 'active', 'de', '2026-01-01', '2026-01-01', '2026-01-01')`, `batch-${index}`, String(index), `batch-${index}@example.test`);
    }
    const prepare = env.DB.prepare;
    env.DB.prepare = (statement) => {
      const prepared = prepare(statement);
      const bind = prepared.bind;
      prepared.bind = (...params) => {
        expect(params.length).toBeLessThanOrEqual(100);
        return bind(...params);
      };
      return prepared;
    };
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    await requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries').get().count).toBe(601);
    expect(queuedMessages()).toHaveLength(601);
    expect(env.MAIL_QUEUE.sendBatch).toHaveBeenCalledTimes(7);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
    expect(env.MAIL_QUEUE.sendBatch.mock.calls.every(([messages]) => messages.length <= 100)).toBe(true);
  });

  it('vergibt bei parallelen Klicks jede Queue-Zustellung nur einmal', async () => {
    let releaseFirstQueueCall;
    env.MAIL_QUEUE.sendBatch
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirstQueueCall = resolve; }))
      .mockResolvedValue();
    const first = requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    await vi.waitFor(() => expect(releaseFirstQueueCall).toBeTypeOf('function'));
    const second = requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });
    await second;
    releaseFirstQueueCall();
    await first;
    expect(queuedMessages()).toHaveLength(2);
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries').get().count).toBe(2);
  });

  it('startet keinen leeren Versand ohne erreichbare Teilnehmende', async () => {
    sql("UPDATE registrations SET participation = 'inactive' WHERE tournament_id = 't1'");
    await expect(requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' })).rejects.toMatchObject({ status: 409 });
    expect(env.DB.sqlite.prepare('SELECT COUNT(*) AS count FROM tournament_ranking_email_dispatches').get().count).toBe(0);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it('erlaubt die Aktion dem Bearbeiter, aber keinem Admin', async () => {
    await expect(requestTournamentRankingEmail(env, await tournament(), { id: 'admin', role: 'admin' })).rejects.toMatchObject({ status: 403 });
    await expect(requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' })).resolves.toMatchObject({ status: 200 });
  });

  it('hält den Auslöser nicht fest, wenn dessen Konto gelöscht wird', async () => {
    await requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });
    await expect(deleteUser(env.DB, 'editor', 'admin', false)).resolves.toMatchObject({ status: 200 });
    expect(env.DB.sqlite.prepare("SELECT requested_by FROM tournament_ranking_email_dispatches WHERE tournament_id = 't1'").get().requested_by).toBeNull();
  });

  it('versendet den im Browser erzeugten Anhang unverändert und versucht ihn nicht erneut', async () => {
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    const payload = queuedMessages()[0];
    const stored = JSON.parse(env.DB.sqlite.prepare("SELECT pdf_attachments FROM tournament_ranking_email_dispatches WHERE tournament_id = 't1'").get().pdf_attachments);
    expect(payload).not.toHaveProperty('attachments');
    const ack = vi.fn();
    const retry = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await worker.queue({ messages: [{ body: payload, ack, retry }] }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
      await worker.queue({ messages: [{ body: payload, ack, retry }] }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
    } finally {
      vi.unstubAllGlobals();
    }

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.to).toBe('anna@example.test');
    expect(sent.attachments[0]).toMatchObject({ filename: 'rangliste.pdf' });
    expect(sent.attachments[0]).toEqual(stored.fr);
    expect(atob(sent.attachments[0].content)).toMatch(/^%PDF-1\.[3-7]/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledTimes(2);
    expect(retry).not.toHaveBeenCalled();
  });

  it('bestätigt fehlgeschlagene Einzelversände ohne Wiederholung oder Rückmeldung', async () => {
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    const payload = queuedMessages()[0];
    const ack = vi.fn();
    const retry = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('too many requests', { status: 429 })));
    try {
      await worker.queue({ messages: [{ body: payload, ack, retry }] }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM postbox_messages WHERE recipient_id = 'owner' AND event_type = 'tournament_ranking_email_failed'").get().count).toBe(0);
  });

  it('bestätigt einen Queue-Fehler auch nach Löschung des Auslösers ohne erneuten Versand', async () => {
    await requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });
    const payload = queuedMessages()[0];
    await deleteUser(env.DB, 'editor', 'admin', false);
    const ack = vi.fn();
    const retry = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
    try {
      await worker.queue({ messages: [{ body: payload, ack, retry }] }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM postbox_messages WHERE event_type = 'tournament_ranking_email_failed'").get().count).toBe(0);
  });

  it('legt beim Abschluss eine Aktion nur bei vorhandener Rangliste an', async () => {
    sql("UPDATE tournaments SET status = 'running' WHERE id = 't1'");
    const request = new Request('https://ptm.test/api/tournaments/t1/publication', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'finished', visibility: 'public' }) });
    await updateTournamentPublication(request, env, await tournament(), { id: 'owner', role: 'user' });

    const messages = env.DB.sqlite.prepare("SELECT recipient_id, event_type FROM postbox_messages WHERE event_type = 'tournament_ranking_email_available' ORDER BY recipient_id").all();
    expect(messages).toEqual([{ recipient_id: 'editor', event_type: 'tournament_ranking_email_available' }, { recipient_id: 'owner', event_type: 'tournament_ranking_email_available' }]);
  });

  it.each(['forme', 'melee', 'supermelee'])('versendet Online-Spielernamen statt Fragezeichen (%s)', async (registrationType) => {
    sql("UPDATE tournaments SET desktop_execution = 0, desktop_ranking_json = NULL, formation = ?, registration_type = ? WHERE id = 't1'", registrationType === 'forme' ? 'tete' : 'doublette', registrationType);
    sql("UPDATE registrations SET first_name = 'Änne', last_name = 'Müller', partner_email = NULL WHERE id = 'r1'");
    sql("UPDATE registrations SET first_name = 'Björn', last_name = 'Weiß', participation = 'active' WHERE id = 'r2'");
    sql("INSERT INTO tournament_rounds (id, tournament_id, round_number, created_at) VALUES ('round', 't1', 1, '2026-01-01')");
    sql(`INSERT INTO tournament_matches (id, tournament_id, round_id, team_a_registration_ids, team_b_registration_ids, score_a, score_b, match_index, created_at, updated_at)
      VALUES ('match', 't1', 'round', '["r1"]', '["r2"]', 13, 7, 0, '2026-01-01', '2026-01-01')`);
    const text = extractPdf(await sentPdf()).replace(/\s+/g, ' ');
    expect(text).toContain('Änne Müller');
    expect(text).toContain('Björn Weiß');
    expect(text).not.toContain('?');
  });

  it.each([false, true])('erhält alle Desktop-Teamnamen und Partner (eigener Teamname: %s)', async (namedTeam) => {
    sql("UPDATE registrations SET first_name = 'Änne', last_name = 'Müller', partner_first_name = 'Björn', partner_last_name = 'Weiß', team_name = ? WHERE id = 'r1'", namedTeam ? 'Boulefreunde Köln' : null);
    const text = extractPdf(await sentPdf()).replace(/\s+/g, ' ');
    expect(text).toContain(namedTeam ? 'Boulefreunde Köln' : 'Änne Müller + Björn Weiß');
  });

  it.each([1, 2])('erzeugt die Postbox-Aktion beim Desktop-Abschluss (Protokoll %s)', async (protocol) => {
    prepareSync(protocol);
    sql("UPDATE tournaments SET status = 'running' WHERE id = 't1'");
    const options = protocol === 2 ? { counter: 1, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } : {};
    await sync('metadata', metadata('finished'), options);
    expect((await tournament()).status).toBe('finished');
    expect(rankingNotifications()).toEqual(['editor', 'owner']);
    await sync('metadata', metadata('finished'), options);
    expect(rankingNotifications()).toEqual(['editor', 'owner']);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it.each([[1, 'ranking-first'], [1, 'finish-first'], [2, 'ranking-first'], [2, 'finish-first']])('meldet die Rangliste genau einmal (Protokoll %s, %s)', async (protocol, order) => {
    prepareSync(protocol);
    let counter = 0;
    const nextOptions = () => protocol === 2 ? { counter: ++counter, requestId: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}` } : {};
    sql("UPDATE tournaments SET status = 'running', desktop_ranking_json = NULL WHERE id = 't1'");
    if (order === 'ranking-first') await sync('ranking', rankingBody, nextOptions());
    else await sync('metadata', metadata('finished'), nextOptions());
    expect(rankingNotifications()).toEqual([]);
    if (order === 'ranking-first') await sync('metadata', metadata('finished'), nextOptions());
    else await sync('ranking', rankingBody, nextOptions());
    expect(rankingNotifications()).toEqual(['editor', 'owner']);
    const options = nextOptions();
    await sync('ranking', rankingBody, options);
    const replay = await sync('ranking', rankingBody, options);
    if (protocol === 2) expect(replay.headers.get('X-PTM-Replayed')).toBe('1');
    expect(rankingNotifications()).toEqual(['editor', 'owner']);
    expect(env.MAIL_QUEUE.send).not.toHaveBeenCalled();
  });

  it('erzeugt bei parallelem Abschluss und Ranglisten-Sync keine doppelten Aktionen', async () => {
    prepareSync();
    sql("UPDATE tournaments SET status = 'running', desktop_ranking_json = NULL WHERE id = 't1'");
    await Promise.all([sync('metadata', metadata('finished')), sync('ranking', rankingBody)]);
    expect(rankingNotifications()).toEqual(['editor', 'owner']);
  });

  it('bleibt nach dem Versand auch bei erneutem Ranglisten-Sync still', async () => {
    prepareSync();
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    await sync('ranking', rankingBody);
    expect(rankingNotifications()).toEqual([]);
    expect(queuedMessages()).toHaveLength(2);
  });

  it('entfernt bei der Datenbereinigung alle Zustellungen, aber nicht die Versandsperre oder junge Turniere', async () => {
    sql("UPDATE tournaments SET date = '2025-01-10' WHERE id = 't1'");
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    sql("UPDATE tournament_ranking_email_deliveries SET attempted_at = '2025-01-11' WHERE email = 'anna@example.test'");
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('young', 'owner', 'Junges Turnier', '2026-09-01', 'Ort', 'tete', 'finished', 'public', '2026-01-01', '2026-01-01')`);
    sql("INSERT INTO tournament_ranking_email_dispatches (tournament_id, requested_by, requested_at) VALUES ('young', 'owner', '2026-09-01')");
    sql("INSERT INTO tournament_ranking_email_deliveries (tournament_id, email, language, created_at) VALUES ('young', 'young@example.test', 'de', '2026-09-01')");

    expect(await purgeExpiredPersonalData(env.DB, new Date('2026-10-12T00:00:00Z'))).toBe(1);
    expect(env.DB.sqlite.prepare("SELECT email FROM registrations WHERE id = 'r1'").get().email).toMatch(/@ohne-email\.invalid$/);
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries WHERE tournament_id = 't1'").get().count).toBe(0);
    expect(env.DB.sqlite.prepare("SELECT requested_by FROM tournament_ranking_email_dispatches WHERE tournament_id = 't1'").get()).toEqual({ requested_by: null });
    expect(env.DB.sqlite.prepare("SELECT pdf_attachments FROM tournament_ranking_email_dispatches WHERE tournament_id = 't1'").get().pdf_attachments).toBe('{}');
    expect(env.DB.sqlite.prepare("SELECT email FROM tournament_ranking_email_deliveries WHERE tournament_id = 'young'").get().email).toBe('young@example.test');
    expect(env.DB.sqlite.prepare("SELECT requested_by FROM tournament_ranking_email_dispatches WHERE tournament_id = 'young'").get().requested_by).toBe('owner');
    expect(await purgeExpiredPersonalData(env.DB, new Date('2026-10-12T00:00:00Z'))).toBe(0);
    // Auch wiederhergestellte Kontaktdaten dürfen den einmaligen Auftrag nicht entsperren.
    sql("UPDATE registrations SET email = 'anna@example.test' WHERE id = 'r1'");
    await requestTournamentRankingEmail(env, await tournament(), { id: 'editor', role: 'user' });
    expect(queuedMessages()).toHaveLength(2);
  });

  it('versendet wartende Queue-Nachrichten nach der Datenbereinigung nicht mehr', async () => {
    sql("UPDATE tournaments SET date = '2025-01-10' WHERE id = 't1'");
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    const messages = queuedMessages().map((body) => ({ body, ack: vi.fn(), retry: vi.fn() }));
    await purgeExpiredPersonalData(env.DB, new Date('2026-10-12T00:00:00Z'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await worker.queue({ messages }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    for (const message of messages) {
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
    }
  });

  it('rollt die Datenbereinigung vollständig zurück, wenn die Zustellungen nicht gelöscht werden können', async () => {
    sql("UPDATE tournaments SET date = '2025-01-10' WHERE id = 't1'");
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    env.DB.sqlite.exec("CREATE TRIGGER reject_delivery_purge BEFORE DELETE ON tournament_ranking_email_deliveries BEGIN SELECT RAISE(ABORT, 'test purge failure'); END");
    await expect(purgeExpiredPersonalData(env.DB, new Date('2026-10-12T00:00:00Z'))).rejects.toThrow('test purge failure');
    expect(env.DB.sqlite.prepare("SELECT email FROM registrations WHERE id = 'r1'").get().email).toBe('Anna@Example.test');
    expect((await tournament()).personal_data_purged_at).toBeNull();
    expect(env.DB.sqlite.prepare("SELECT COUNT(*) AS count FROM tournament_ranking_email_deliveries WHERE tournament_id = 't1'").get().count).toBe(2);
    expect(env.DB.sqlite.prepare("SELECT requested_by FROM tournament_ranking_email_dispatches WHERE tournament_id = 't1'").get().requested_by).toBe('owner');
  });

  it('stoppt auch eine vor der Datenbereinigung reservierte Zustellung', async () => {
    sql("UPDATE tournaments SET date = '2025-01-10' WHERE id = 't1'");
    await requestTournamentRankingEmail(env, await tournament(), { id: 'owner', role: 'user' });
    const prepare = env.DB.prepare;
    env.DB.prepare = (statement) => {
      const prepared = prepare(statement);
      if (!statement.startsWith('UPDATE tournament_ranking_email_deliveries SET attempted_at')) return prepared;
      return {
        ...prepared,
        bind: (...params) => {
          const bound = prepared.bind(...params);
          return { ...bound, first: async () => {
            const delivery = await bound.first();
            await purgeExpiredPersonalData(env.DB, new Date('2026-10-12T00:00:00Z'));
            return delivery;
          } };
        },
      };
    };
    const fetchMock = vi.fn();
    const message = { body: queuedMessages()[0], ack: vi.fn(), retry: vi.fn() };
    vi.stubGlobal('fetch', fetchMock);
    try {
      await worker.queue({ messages: [message] }, { ...env, RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await tournament()).personal_data_purged_at).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });
});

describe('Ranglisten-PDF', () => {
  const tournament = { name: 'Herbstpokal Köln', date: '2026-10-12', location: 'Süd' };

  it('erhält WinAnsi-Umlaute und Akzente und ersetzt nicht darstellbare Zeichen lesbar', () => {
    const label = 'Änne Müller + Björn Weiß + François Lévêque';
    const unicode = 'Łukasz Żółć + ő č + İpek';
    const attachment = createRankingPdfAttachment({ ...tournament, name: 'CŒte d’Or' }, [
      { rank: 1, label, wins: 3 },
      { rank: 2, label: unicode, wins: 2 },
    ], 'fr');
    const text = extractPdf(attachment).replace(/\s+/g, ' ');
    expect(attachment.filename).toBe('rangliste.pdf');
    expect(text).toContain('CŒte d’Or');
    expect(text).toContain('Süd');
    const teamText = pdfPages(attachment).flat()
      .filter((word) => word.x >= 92 && word.right <= 317 && word.y > 151 && word.bottom < 790)
      .map((word) => word.text).join(' ');
    expect(teamText).toContain(label);
    expect(teamText).toContain('Lukasz Zólc + o c + Ipek');
    expect(text).toContain('Équipe');
    const bytes = Buffer.from(attachment.content, 'base64').toString('latin1');
    expect(bytes).toContain('/BaseFont /Helvetica');
    expect(bytes).toContain('/Encoding /WinAnsiEncoding');
    expect(bytes).not.toContain('/FontFile2');
    expect(Buffer.from(attachment.content, 'base64').length).toBeLessThan(10_000);
  });

  it('wiederholt Kopfzeilen auf Folgeseiten und bricht lange Teamnamen um', () => {
    const ranking = Array.from({ length: 55 }, (_, index) => ({ rank: index + 1, label: `Mannschaft${index + 1} mit einem besonders langen Namen für die Triplette`, wins: 2 }));
    const attachment = createRankingPdfAttachment(tournament, ranking);
    const pages = pdfPages(attachment);
    expect(pages.length).toBeGreaterThan(1);
    for (const words of pages) {
      expect(words.some((word) => word.text === 'Herbstpokal')).toBe(true);
      expect(words.some((word) => word.text === 'Platz')).toBe(true);
      expect(words.some((word) => word.text === 'Team')).toBe(true);
    }
    const first = pages[0];
    const start = first.find((word) => word.text === 'Mannschaft1');
    const continuation = first.find((word) => word.text === 'Triplette');
    expect(continuation.y).toBeGreaterThan(start.y);
    expect(extractPdf(attachment).replace(/\s+/g, ' ')).toContain('Mannschaft55');
  });

  it('ordnet Titel, Tabellenzeilen und Seitenzahl von oben nach unten an', () => {
    const [words] = pdfPages(createRankingPdfAttachment(tournament, [
      { rank: 1, label: 'Erste Mannschaft', wins: 3 },
      { rank: 2, label: 'Zweite Mannschaft', wins: 2 },
    ]));
    const title = words.find((word) => word.text === 'Herbstpokal');
    const first = words.find((word) => word.text === 'Erste');
    const second = words.find((word) => word.text === 'Zweite');
    const footer = words.at(-1);
    expect(title.bottom).toBeLessThan(first.y);
    expect(first.bottom).toBeLessThan(second.y);
    expect(second.bottom).toBeLessThan(footer.y);
    expect(footer.text).toBe('1');
  });

  it('reserviert Platz für mehrzeilige Titel und Orte, auch auf Folgeseiten', () => {
    const name = Array(12).fill('Herbstpokal').join(' ');
    const location = Array(8).fill('Bouleplatz Köln').join(' ');
    const ranking = Array.from({ length: 80 }, (_, index) => ({ rank: index + 1, label: `Mannschaft${index + 1}`, wins: 3 }));
    const pages = pdfPages(createRankingPdfAttachment({ ...tournament, name, location }, ranking));
    expect(pages.length).toBeGreaterThan(1);
    for (const words of pages) {
      const titles = words.filter((word) => word.text === 'Herbstpokal');
      expect(new Set(titles.map((word) => word.y)).size).toBeGreaterThan(1);
      expect(titles).toHaveLength(12);
      const heading = words.find((word) => word.text === 'Endrangliste');
      const date = words.find((word) => word.text === 'Datum:');
      const places = words.filter((word) => word.text === 'Bouleplatz' || word.text === 'Köln');
      const column = words.find((word) => word.text === 'Platz');
      const firstRow = words.find((word) => /^Mannschaft\d+$/.test(word.text));
      expect(Math.max(...titles.map((word) => word.bottom))).toBeLessThan(heading.y);
      expect(heading.bottom).toBeLessThan(date.y);
      expect(Math.max(...places.map((word) => word.bottom))).toBeLessThan(column.y);
      expect(column.bottom).toBeLessThan(firstRow.y);
      expect(Math.max(...words.map((word) => word.right))).toBeLessThanOrEqual(545);
    }
  });

  it('begrenzt extreme Kopftexte und teilt überlange Teamzeilen sicher über Seiten', () => {
    const label = Array(1600).fill('Langname').join(' ');
    const attachment = createRankingPdfAttachment({ ...tournament, name: 'Titel '.repeat(200), location: 'Ort '.repeat(200) }, [{ rank: 1, label, wins: 1 }]);
    const pages = pdfPages(attachment);
    expect(pages.length).toBeGreaterThan(1);
    const words = pages.flat();
    expect(words.filter((word) => word.text === 'Langname')).toHaveLength(1600);
    expect(Math.max(...words.map((word) => word.bottom))).toBeLessThan(820);
    expect(words.some((word) => word.text.endsWith('…'))).toBe(true);
  });

  it('bricht auch ein einzelnes überlanges Wort innerhalb der Teamspalte um', () => {
    const label = 'W'.repeat(80);
    const [words] = pdfPages(createRankingPdfAttachment(tournament, [{ rank: 1, label, wins: 1 }]));
    const fragments = words.filter((word) => /^W+-?$/.test(word.text));
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.map((word) => word.text.replace(/-$/, '')).join('')).toBe(label);
    expect(fragments.every((word) => word.x >= 92 && word.right <= 317)).toBe(true);
  });

  it.each(['de', 'en', 'fr', 'es', 'nl'])('hält alle Spaltenüberschriften innerhalb ihrer Breite (%s)', (language) => {
    const [words] = pdfPages(createRankingPdfAttachment(tournament, [{ rank: 1, label: 'Mannschaft', wins: 3, pointsFor: 39, pointsAgainst: 12, pointsDiff: 27 }], language));
    const team = words.find((word) => word.text === 'Mannschaft');
    const headings = words.filter((word) => word.y > 125 && word.bottom < team.y);
    // Auch mit den lokalisierten Beschriftungen darf keine Überschrift in eine
    // zweite Zeile umbrechen und die untere Tabellenlinie überschreiben.
    expect(headings.every((word) => word.bottom < 151)).toBe(true);
    const bounds = [[50, 86], [92, 317], [330, 392], [400, 448], [455, 497], [505, 545]];
    for (const [left, right] of bounds) {
      const column = headings.filter((word) => word.x >= left && word.x < right);
      expect(column.length).toBeGreaterThan(0);
      expect(column.every((word) => word.right <= right)).toBe(true);
    }
  });

  it('beschriftet die spanische Gegenpunkte-Spalte korrekt', () => {
    const text = extractPdf(createRankingPdfAttachment(tournament, [{ rank: 1, label: 'Mannschaft', pointsAgainst: 12 }], 'es'));
    expect(text).toContain('Puntos -');
    expect(text).not.toContain('Points -');
  });
});
