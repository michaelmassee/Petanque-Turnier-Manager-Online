// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker from './worker.js';

// Ankündigung aus dem Turnierdokument: gleiche Regeln wie in der Web-App, aber über die Sync-API mit Dokument-Lease.
describe('Ankündigung aus dem Turnierdokument', () => {
  const PTM_ZUGANG = 'e2e-api-key-mit-ausreichender-laenge';
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const gespeichert = () => env.DB.sqlite.prepare("SELECT announcement, announcement_at FROM tournaments WHERE id = 't1'").get();
  const ankuendigen = (text, optionen) => {
    const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/announcement', { text }, optionen);
    request.headers.set('Authorization', `Bearer ${PTM_ZUGANG}`);
    return worker.fetch(request, env);
  };

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) } };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-01-01', '2026-01-01')`);
    sql(`INSERT INTO api_keys (id, user_id, key_hash, label, status, requested_at, approved_at, created_at, updated_at)
      VALUES ('key1', 'owner', ?, 'PTM', 'approved', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')`,
    createHash('sha256').update(PTM_ZUGANG).digest('hex'));
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, registration_type, type, status, visibility,
      live_view_enabled, desktop_execution, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'tete', 'forme', 'schweizer', 'running', 'public', 1, 1,
        '2026-01-01', '2026-01-01')`);
    bindeDokument(env.DB.sqlite, 't1');
  });

  it('setzt die Ankündigung bereinigt und liefert sie zurück', async () => {
    const antwort = await ankuendigen('  Runde 3 startet\r\num 14:30\u0007  ');

    expect(antwort.status).toBe(200);
    const { announcement } = await antwort.json();
    expect(announcement.text).toBe('Runde 3 startet\num 14:30');
    expect(gespeichert().announcement).toBe('Runde 3 startet\num 14:30');
    expect(gespeichert().announcement_at).toBeTruthy();
  });

  it('löscht die Ankündigung mit leerem Text', async () => {
    await ankuendigen('Mittagspause');

    const antwort = await ankuendigen('');

    expect(antwort.status).toBe(200);
    expect((await antwort.json()).announcement).toBeNull();
    expect(gespeichert()).toEqual({ announcement: null, announcement_at: null });
  });

  it('lehnt mehr als 300 Zeichen ab', async () => {
    const antwort = await ankuendigen('x'.repeat(301));

    expect(antwort.status).toBe(400);
    expect(gespeichert().announcement).toBeNull();
  });

  it('verlangt die Lease des gebundenen Dokuments', async () => {
    const antwort = await ankuendigen('Fremdes Dokument', { lease: 'falsche-lease-mit-ausreichender-laenge-0123456789' });

    expect(antwort.status).toBe(409);
    expect(gespeichert().announcement).toBeNull();
  });

  it('lehnt ein abgeschlossenes Turnier mit Konfliktcode ab', async () => {
    sql("UPDATE tournaments SET status = 'finished' WHERE id = 't1'");

    const antwort = await ankuendigen('Zu spät');

    expect(antwort.status).toBe(409);
    expect((await antwort.json()).details).toMatchObject({ code: 'tournament_finished' });
  });

  it('führt einen wiederholten Auftrag nicht doppelt aus', async () => {
    bindeDokument(env.DB.sqlite, 't1', { protocol: 2 });
    const requestId = '33333333-3333-4333-8333-333333333333';

    const erste = await ankuendigen('Siegerehrung 18 Uhr', { counter: 1, requestId });
    const zweite = await ankuendigen('Siegerehrung 18 Uhr', { counter: 1, requestId });

    expect(erste.status).toBe(200);
    expect(zweite.status).toBe(200);
    expect(zweite.headers.get('X-PTM-Replayed')).toBe('1');
    expect(gespeichert().announcement).toBe('Siegerehrung 18 Uhr');
  });
});
