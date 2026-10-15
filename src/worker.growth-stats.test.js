// @vitest-environment node
// Admin-Dashboard: Bestand und Zuwachs von Benutzern und Turnieren je UTC-Tag; Kalendereinträge zählen nicht.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { getGrowthStats } from './worker.js';

describe('Wachstumsstatistik', () => {
  let db;
  const now = new Date('2026-10-15T12:00:00Z');
  const statistik = async (kind, days = 30) => (await getGrowthStats(db, kind, days, now)).json();
  const benutzer = (id, createdAt) => db.sqlite.prepare(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
    VALUES (?, ?, 'user', 's', 'h', ?, ?)`).run(id, `${id}@example.test`, createdAt, createdAt);
  const turnier = (id, createdAt, registrationEnabled = 1) => db.sqlite.prepare(`INSERT INTO tournaments
    (id, owner_id, name, date, location, formation, status, visibility, registration_enabled, created_at, updated_at)
    VALUES (?, 'u1', 'T', '2099-01-01', 'Ort', 'doublette', 'registration', 'public', ?, ?, ?)`).run(id, registrationEnabled, createdAt, createdAt);

  beforeEach(() => {
    db = d1MitSchema();
    benutzer('u1', '2026-08-01T10:00:00.000Z');
    benutzer('u2', '2026-10-14T23:59:00.000Z');
    benutzer('u3', '2026-10-15T00:01:00.000Z');
    benutzer('u4', '2026-10-15T08:00:00.000Z');
  });

  it('zählt Benutzer je Tag und den Gesamtstand inklusive älterer Konten', async () => {
    const result = await statistik('users');
    expect(result.days).toHaveLength(30);
    expect(result.days.at(-2)).toEqual({ day: '2026-10-14', added: 1, total: 2 });
    expect(result.days.at(-1)).toEqual({ day: '2026-10-15', added: 2, total: 4 });
    expect(result.days[0]).toEqual({ day: '2026-09-16', added: 0, total: 1 });
    expect(result.totals).toEqual({ total: 4, today: 2, range: 3, since: '2026-08-01' });
  });

  it('lässt Kalendereinträge bei den Turnieren weg', async () => {
    turnier('t1', '2026-10-10T09:00:00.000Z');
    turnier('t2', '2026-10-15T09:00:00.000Z');
    turnier('k1', '2026-10-15T10:00:00.000Z', 0);
    const result = await statistik('tournaments');
    expect(result.totals).toEqual({ total: 2, today: 1, range: 2, since: '2026-10-10' });
  });

  it('fällt bei unbekanntem Zeitraum auf 30 Tage zurück und lehnt unbekannte Statistiken ab', async () => {
    expect((await statistik('users', 7)).range).toBe(30);
    await expect(getGrowthStats(db, 'secrets', 30, now)).rejects.toMatchObject({ status: 400 });
  });
});
