import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { createFlyerFontLoader } from './flyer-fonts.js';
import { renderFlyerPdf, renderFlyerSvg } from './flyer-render.js';
import { buildFlyerScene } from './flyer-scene.js';

const require = createRequire(import.meta.url);
const loadFonts = createFlyerFontLoader(async (subset, weight) => readFileSync(require.resolve(`@fontsource/noto-sans/files/noto-sans-${subset}-${weight}-normal.woff`)));
const tournament = { id: 't1', name: 'Turnier in Łódź – Straße', date: '2026-10-20', location: 'Plac Wolności, Łódź', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'open', feeTiers: [], entryFeeCents: 500, currency: 'EUR', timezone: 'Europe/Berlin' };
const t = (value) => value;

describe('flyer fonts and rendering', () => {
  it('sets every character with a font that has a glyph for it, loading subsets only on demand', async () => {
    const latinOnly = await loadFonts('Herbstturnier');
    expect(new Set(latinOnly.entries.map((entry) => entry.subset))).toEqual(new Set(['latin']));
    const text = 'Äß € Łódź Ελλάδα Москва';
    const fontSet = await loadFonts(text);
    for (const weight of [400, 700]) {
      for (const run of fontSet.runs(text, weight)) {
        for (const char of run.text) expect(run.entry.font.hasGlyphForCodePoint(char.codePointAt(0)), char).toBe(true);
      }
    }
  });

  it('renders SVG and PDF from the same scene', async () => {
    const scene0 = buildFlyerScene(tournament, { format: 'a5' }, 'de', t);
    const fontSet = await loadFonts(scene0.elements.filter((element) => element.type === 'text').map((element) => element.text).join(''));
    const scene = buildFlyerScene(tournament, { format: 'a5' }, 'de', t, { measure: fontSet.measure });
    const qrModules = QRCode.create('https://ptmonline.org/q/abc', { errorCorrectionLevel: 'M' }).modules;
    const svg = renderFlyerSvg(scene, { fontSet, qrModules, logo: null });
    expect(svg).toContain('PTMFlyer-latin-ext-700');
    expect(svg).toContain('@font-face');
    const pdf = await renderFlyerPdf(scene, { fontSet, qrModules, logo: null, title: tournament.name });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });
});
