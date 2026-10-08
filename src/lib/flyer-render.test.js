import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderFlyerSvg } from './flyer-render.js';
import { buildFlyerScene } from './flyer-scene.js';
import { recordingTypesetter } from './flyer-test-typesetter.js';

const tournament = { id: 't1', name: 'Turnier in Łódź – Straße', date: '2026-10-20', location: 'Plac Wolności, Łódź', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'open', feeTiers: [], entryFeeCents: 500, currency: 'EUR', timezone: 'Europe/Berlin' };
const t = (value) => value;
// Platzhalter für das QR-Bild aus qr-code-styling (im Browser erzeugt).
const png = readFileSync('public/icons/logo.png');
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
const qr = { dataUrl, background: '#ffffff' };

// Das PDF (svg2pdf.js) braucht ein echtes Browser-DOM und wird im Browser-Test geprüft.
describe('flyer rendering', () => {
  it('composes one SVG with satori text as vector paths, without font files', async () => {
    const scene = await buildFlyerScene(tournament, { format: 'a5' }, 'de', t, { typeset: recordingTypesetter() });
    const svg = renderFlyerSvg(scene, { qr, logo: null });
    expect(svg).toContain('<g transform="translate(');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('@font-face');
    expect(svg).toContain(qr.dataUrl);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('embeds a local background image underneath the flyer scene', async () => {
    const background = { dataUrl, width: 400, height: 100, type: 'image/png' };
    const scene = await buildFlyerScene(tournament, {}, 'de', t, { typeset: recordingTypesetter(), background });
    expect(scene.design.templateId).toBe('background');
    expect(renderFlyerSvg(scene, { qr, logo: null, background })).toContain('preserveAspectRatio="xMidYMid slice"');
  });
});
