import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createFlyerTypesetter } from './flyer-text.js';
import { rankingColumnKeys, rankingHeaderGroups, rankingValue } from './live-ranking.js';
import { buildRankingPages, rankingFileName, renderRankingSvg, RANKING_PAGE } from './ranking-pdf.js';

const require = createRequire(import.meta.url);
const typeset = createFlyerTypesetter(async (subset, weight, style) => readFileSync(require.resolve(`@fontsource/noto-sans/files/noto-sans-${subset}-${weight}-${style}.woff`)),
  () => import('satori').then((module) => module.default));
const t = (key) => key;
const tournament = { name: 'Herbstturnier', type: 'schweizer', schweizerRankingMode: 'mit_buchholz' };
const entry = (index) => ({ rank: index + 1, registrationIds: [`r${index}`], label: index === 0 ? 'Łukasz Żółć + Андрей' : `Spieler ${index}`, wins: 3, bhz: 7, fbhz: 21, pointsFor: 39, pointsAgainst: 15, pointsDiff: 24 });
const header = { title: 'Rangliste', name: 'Herbstturnier', lines: ['14.10.2026', 'BC Linden'] };
const logo = { dataUrl: 'data:image/png;base64,AAAA', width: 200, height: 100 };

describe('Ranglisten-PDF', () => {
  it('setzt Kopf, Logos und Fußzeile und bricht lange Listen auf mehrere Seiten um', async () => {
    const pages = await buildRankingPages({
      tournament, entries: Array.from({ length: 70 }, (_, index) => entry(index)), header, logos: { club: logo, ptm: logo },
      footer: (page, total) => `Seite ${page} / ${total}`, t, typeset,
    });

    expect(pages.length).toBeGreaterThan(1);
    const svg = renderRankingSvg(pages[0]);
    expect(svg).toContain(`viewBox="0 0 ${RANKING_PAGE.width} ${RANKING_PAGE.height}"`);
    expect(svg.match(/<image /g)).toHaveLength(2);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<text');
    // Logo 2:1 in der 24-mm-Box: volle Breite, halbe Höhe, vertikal zentriert.
    expect(pages[0].elements[0]).toMatchObject({ type: 'image', x: 15, y: 21, width: 24, height: 12 });
    for (const page of pages) {
      const table = page.elements.find((element) => element.type === 'text' && element.x === 15 && element.y > 30 && element.y < 100);
      expect(table.y + table.height).toBeLessThanOrEqual(RANKING_PAGE.height - 15 - 8);
    }
  });

  it('kommt ohne Vereinslogo aus', async () => {
    const [page] = await buildRankingPages({ tournament, entries: [entry(0)], header, logos: { club: null, ptm: logo }, footer: () => '', t, typeset });
    expect(page.elements.filter((element) => element.type === 'image')).toHaveLength(1);
  });

  it('bildet einen sprechenden Dateinamen', () => {
    expect(rankingFileName({ name: 'Großer Preis von Gießen 2026' })).toBe('rangliste-grosser-preis-von-giessen-2026.pdf');
    expect(rankingFileName({ name: '***' })).toBe('rangliste-turnier.pdf');
  });
});

describe('Ranglisten-Spalten (Tabelle und PDF)', () => {
  const koEntry = { rank: 1, registrationIds: ['r1'], label: 'Team A', wins: 2, losses: 1, gameDiff: 1, pointsFor: 30, pointsAgainst: 31, pointsDiff: -1 };

  it('lässt Niederlagen weg und fasst Spiele und Punkte zu Gruppen mit +, − und Δ zusammen', () => {
    const ko = { type: 'ko' };
    const columns = rankingColumnKeys(ko, [koEntry]);
    expect(columns).toEqual(['rank', 'label', 'wins', 'gameDiff', 'pointsFor', 'pointsAgainst', 'pointsDiff']);
    expect(rankingHeaderGroups(columns, ko, t)).toEqual([
      { id: 'rank', label: 'Platz', keys: ['rank'] },
      { id: 'label', label: 'Team', keys: ['label'] },
      { id: 'games', label: 'Spiele', keys: ['wins', 'gameDiff'], subLabels: ['+', 'Δ'] },
      { id: 'points', label: 'Punkte', keys: ['pointsFor', 'pointsAgainst', 'pointsDiff'], subLabels: ['+', '−', 'Δ'] },
    ]);
  });

  it('behält Siege als Einzelspalte, wenn es keine Spieldifferenz gibt (Schweizer)', () => {
    const columns = rankingColumnKeys(tournament, [entry(0)]);
    expect(rankingHeaderGroups(columns, tournament, t).map((group) => group.label)).toEqual(['Platz', 'Team', 'Siege', 'BHZ', 'FBHZ', 'Punkte']);
  });

  it('zeigt Differenzen mit Vorzeichen', () => {
    expect(['gameDiff', 'pointsDiff'].map((key) => [rankingValue(key, 3), rankingValue(key, -2), rankingValue(key, 0)])).toEqual([['+3', '−2', '0'], ['+3', '−2', '0']]);
    expect(rankingValue('wins', 3)).toBe('3');
    expect(rankingValue('pointsDiff', null)).toBe('—');
  });

  it('setzt die K.O.-Rangliste mit zweizeiligem Kopf', async () => {
    const [page] = await buildRankingPages({ tournament: { type: 'ko', name: 'K.O.' }, entries: [koEntry], header, logos: { club: null, ptm: null }, footer: () => '', t, typeset });
    expect(renderRankingSvg(page)).toContain('<path');
  });
});
