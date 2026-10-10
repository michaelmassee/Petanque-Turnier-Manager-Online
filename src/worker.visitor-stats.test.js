// @vitest-environment node
// Besucherstatistik: eindeutige Besucher pro Tag, getrennt nach angemeldeten Nutzern und Gästen (Migration 0104).
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import { getVisitorStats, recordVisit } from './worker.js';

describe('Besucherstatistik', () => {
  let db;
  const tag1 = new Date('2026-10-09T10:00:00Z');
  const tag2 = new Date('2026-10-10T23:30:00Z');
  const gast = (ip, now, userAgent = 'Firefox') => recordVisit(db, { userId: null, ip, userAgent, secret: 'geheim', now });
  const nutzer = (userId, now) => recordVisit(db, { userId, ip: '1.1.1.1', userAgent: 'Firefox', secret: 'geheim', now });
  const statistik = async (days, now = tag2) => (await getVisitorStats(db, days, now)).json();

  beforeEach(() => {
    db = d1MitSchema();
  });

  it('zählt Nutzer und Gäste je Tag nur einmal', async () => {
    await nutzer('u1', tag1);
    await nutzer('u1', tag1);
    await gast('1.1.1.1', tag1);
    await gast('1.1.1.1', tag1);
    await gast('1.1.1.1', tag1, 'Chrome');
    await nutzer('u1', tag2);
    await gast('2.2.2.2', tag2);

    const result = await statistik(30);
    expect(result.days.find((entry) => entry.day === '2026-10-09')).toEqual({ day: '2026-10-09', users: 1, guests: 2 });
    expect(result.totals.today).toEqual({ users: 1, guests: 1, total: 2 });
    expect(result.totals.range).toEqual({ users: 2, guests: 3, total: 5 });
    expect(result.totals.allTime).toEqual({ users: 2, guests: 3, total: 5, since: '2026-10-09' });
  });

  it('speichert für Gäste weder IP noch einen tagesübergreifend gleichen Schlüssel', async () => {
    await gast('1.1.1.1', tag1);
    await gast('1.1.1.1', tag2);
    const keys = db.sqlite.prepare('SELECT visitor_key FROM visitor_days').all().map((row) => row.visitor_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.join()).not.toContain('1.1.1.1');
  });

  it('zählt Gäste ohne Secret nicht', async () => {
    await recordVisit(db, { userId: null, ip: '1.1.1.1', userAgent: 'Firefox', secret: undefined, now: tag1 });
    expect((await statistik(30)).totals.allTime.total).toBe(0);
  });

  it('füllt den Zeitraum lückenlos und begrenzt ihn auf erlaubte Werte', async () => {
    await nutzer('u1', tag1);
    const result = await statistik(90);
    expect(result.range).toBe(90);
    expect(result.days).toHaveLength(90);
    expect(result.days.at(-1)).toEqual({ day: '2026-10-10', users: 0, guests: 0 });
    expect(result.days.at(0).day).toBe('2026-07-13');
    expect((await statistik(7)).days).toHaveLength(30);
  });
});
