import { describe, expect, it } from 'vitest';
import { approximateMeasure } from './flyer-fonts.js';
import { buildFlyerScene, wrapText } from './flyer-scene.js';

const tournament = { name: 'Herbstturnier', date: '2026-10-20', startTime: '10:00', location: 'Bouleplatz Linden', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'open', feeTiers: [], entryFeeCents: 500, currency: 'EUR', maxRegistrations: 32, registrationDeadline: '2026-10-18T18:00:00Z', timezone: 'Europe/Berlin' };
const t = (value) => value;
const LONG_HEADLINE = 'Großes Herbstturnier des Boule-Clubs Linden mit Abendessen und Siegerehrung';
const LONG_SUBTITLE = 'Offenes Doublette-Turnier für alle Lizenzspielerinnen und Lizenzspieler aus der Region, Gäste sind herzlich willkommen';

function textBottom(scene) {
  return Math.max(...scene.elements.filter((element) => element.type === 'text' && element.size > 3.6).map((element) => element.y + element.size * 0.25));
}

describe('flyer scene', () => {
  it('uses the real registration capacity wording and A5 dimensions', () => {
    const scene = buildFlyerScene(tournament, { format: 'a5' }, 'de', t);
    expect(scene.page).toEqual({ width: 148, height: 210 });
    expect(scene.elements.some((element) => element.text === 'Maximal 32 Anmeldungen')).toBe(true);
  });

  it('reports overflow when the content would reach the footer', () => {
    const scene = buildFlyerScene(tournament, { format: 'a5', headline: LONG_HEADLINE, subtitle: LONG_SUBTITLE }, 'de', t);
    const separator = scene.elements.find((element) => element.type === 'line');
    expect(textBottom(scene)).toBeGreaterThan(separator.y1 - 4);
    expect(scene.overflow).toBe(true);
  });

  it('keeps every text above the footer whenever no overflow is reported', () => {
    for (const format of ['a4', 'a5']) {
      for (const headline of ['', 'Kurz', LONG_HEADLINE]) {
        for (const additionalText of ['', 'Ein Satz.', 'Absatz eins\n\nAbsatz zwei mit etwas mehr Text, der umbrochen werden muss.']) {
          const scene = buildFlyerScene(tournament, { format, headline, additionalText }, 'de', t);
          if (scene.overflow) continue;
          const separator = scene.elements.find((element) => element.type === 'line');
          const qr = scene.elements.find((element) => element.type === 'qr');
          const bodyTexts = scene.elements.filter((element) => element.type === 'text' && element.y < separator.y1);
          expect(Math.max(...bodyTexts.map((element) => element.y))).toBeLessThan(separator.y1 - 4);
          const notes = scene.elements.filter((element) => element.type === 'text' && element.y > separator.y1);
          for (const note of notes) expect(note.x + approximateMeasure(note.text, note.size)).toBeLessThanOrEqual(qr.x);
        }
      }
    }
  });

  it('breaks words that are wider than the line on their own', () => {
    const lines = wrapText('Siehe https://example.org/ein/sehr/langer/pfad/zum/turnier', 40, 4.3, 400, approximateMeasure);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(approximateMeasure(line, 4.3)).toBeLessThanOrEqual(40);
  });

  it('uses the template text color and draws the logo in the given proportions', () => {
    const scene = buildFlyerScene(tournament, { templateId: 'sporty' }, 'de', t, { logo: { width: 400, height: 100 } });
    expect(scene.elements.find((element) => element.type === 'text').color).toBe('#0f6b3a');
    const logo = scene.elements.find((element) => element.type === 'image');
    expect(logo.width / logo.height).toBeCloseTo(4);
  });
});
