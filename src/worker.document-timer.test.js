// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { bindeDokument, syncAnfrage } from './test-support/sync.js';
import worker from './worker.js';

// Timer aus dem Turnierdokument: PTM überträgt den absoluten Stand, die Live-Ansichten zählen selbst herunter.
describe('Timer aus dem Turnierdokument', () => {
  const PTM_ZUGANG = 'e2e-api-key-mit-ausreichender-laenge';
  const JETZT = Date.parse('2099-09-28T10:00:00.000Z');
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);
  const gespeichert = () => JSON.parse(env.DB.sqlite.prepare("SELECT timer FROM tournaments WHERE id = 't1'").get().timer);
  const setzeTimer = (body, optionen) => {
    const request = syncAnfrage('PUT', '/api/sync/tournaments/t1/timer', body, optionen);
    request.headers.set('Authorization', `Bearer ${PTM_ZUGANG}`);
    return worker.fetch(request, env);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(JETZT);
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startet den Timer mit der Restzeit ab Eingang beim Server', async () => {
    const antwort = await setzeTimer({ state: 'running', remainingSec: 1761, durationSec: 3000, label: 'Runde 1' });

    expect(antwort.status).toBe(200);
    expect((await antwort.json()).timer).toEqual({
      state: 'running', label: 'Runde 1', durationSec: 3000, endsAt: new Date(JETZT + 1761 * 1000).toISOString(),
    });
    expect(gespeichert().revision).toBe(1);
  });

  it('hält den Timer mit Restzeit an und zählt die Revision hoch', async () => {
    await setzeTimer({ state: 'running', remainingSec: 600, durationSec: 600, label: '' });

    const antwort = await setzeTimer({ state: 'paused', remainingSec: 540, durationSec: 600, label: '' });

    expect((await antwort.json()).timer).toEqual({ state: 'paused', label: '', durationSec: 600, remainingSec: 540 });
    expect(gespeichert().revision).toBe(2);
  });

  it('blendet den gestoppten Timer aus und behält Dauer und Bezeichnung als Vorbelegung', async () => {
    await setzeTimer({ state: 'running', remainingSec: 600, durationSec: 600, label: 'Finale' });

    const antwort = await setzeTimer({ state: 'stopped', durationSec: 600, label: 'Finale' });

    expect((await antwort.json()).timer).toBeNull();
    expect(gespeichert()).toMatchObject({ label: 'Finale', durationSec: 600 });
  });

  it('lehnt eine ungültige Restzeit ab', async () => {
    const antwort = await setzeTimer({ state: 'running', remainingSec: 100 * 60, durationSec: 600 });

    expect(antwort.status).toBe(400);
  });

  it('verlangt die Lease des gebundenen Dokuments', async () => {
    const antwort = await setzeTimer({ state: 'running', remainingSec: 60, durationSec: 60 },
      { lease: 'falsche-lease-mit-ausreichender-laenge-0123456789' });

    expect(antwort.status).toBe(409);
  });

  it('lehnt ein abgeschlossenes Turnier mit Konfliktcode ab', async () => {
    sql("UPDATE tournaments SET status = 'finished' WHERE id = 't1'");

    const antwort = await setzeTimer({ state: 'running', remainingSec: 60, durationSec: 60 });

    expect(antwort.status).toBe(409);
    expect((await antwort.json()).details).toMatchObject({ code: 'tournament_finished' });
  });
});
