import { describe, expect, it } from 'vitest';
import { FLYER_TEMPLATES } from './flyer-config.js';
import { approximateMeasure } from './flyer-fonts.js';
import { buildFlyerScene, wrapText } from './flyer-scene.js';

const tournament = { name: 'Herbstturnier', date: '2026-10-20', startTime: '10:00', location: 'Bouleplatz Linden', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'open', feeTiers: [], entryFeeCents: 500, currency: 'EUR', maxRegistrations: 32, registrationDeadline: '2026-10-18T18:00:00Z', timezone: 'Europe/Berlin' };
const t = (value) => value;
const LONG_HEADLINE = 'Großes Herbstturnier des Boule-Clubs Linden mit Abendessen und Siegerehrung';
const LONG_SUBTITLE = 'Offenes Doublette-Turnier für alle Lizenzspielerinnen und Lizenzspieler aus der Region, Gäste sind herzlich willkommen';
const LONG_NOTE = 'Für Verpflegung ist gesorgt.\n'.repeat(30);

function textBox(element) {
  return { left: element.x, right: element.x + approximateMeasure(element.text, element.size, element.weight), top: element.y - element.size * 0.8, bottom: element.y + element.size * 0.25 };
}

describe('flyer scene', () => {
  it('uses the real registration capacity wording and A5 dimensions', () => {
    const scene = buildFlyerScene(tournament, { format: 'a5' }, 'de', t);
    expect(scene.page).toEqual({ width: 148, height: 210 });
    expect(scene.elements.some((element) => element.text === 'Maximal 32 Anmeldungen')).toBe(true);
  });

  it('reports overflow when the details would reach the footer', () => {
    for (const templateId of FLYER_TEMPLATES) {
      const scene = buildFlyerScene(tournament, { templateId, format: 'a5', headline: LONG_HEADLINE, subtitle: LONG_SUBTITLE, additionalText: LONG_NOTE }, 'de', t);
      expect(scene.bodyBottom, templateId).toBeGreaterThan(scene.bodyLimit);
      expect(scene.overflow, templateId).toBe(true);
    }
  });

  it('keeps every text on the page and clear of the QR card whenever no overflow is reported', () => {
    for (const templateId of FLYER_TEMPLATES) {
      for (const format of ['a4', 'a5']) {
        for (const headline of ['', LONG_HEADLINE]) {
          for (const additionalText of ['', 'Absatz eins\n\nAbsatz zwei mit etwas mehr Text, der umbrochen werden muss.']) {
            const scene = buildFlyerScene(tournament, { templateId, format, headline, additionalText }, 'de', t);
            const label = `${templateId}/${format}/${headline.length}/${additionalText.length}`;
            expect(scene.overflow, label).toBe(false);
            const qr = scene.elements.find((element) => element.type === 'qr');
            for (const element of scene.elements.filter((item) => item.type === 'text' && item.text !== 'Jetzt anmelden')) {
              const box = textBox(element);
              expect(box.left, `${label} ${element.text}`).toBeGreaterThanOrEqual(0);
              expect(box.right, `${label} ${element.text}`).toBeLessThanOrEqual(scene.page.width);
              expect(box.bottom, `${label} ${element.text}`).toBeLessThanOrEqual(scene.page.height);
              const overlapsQr = box.right > qr.x && box.left < qr.x + qr.size && box.bottom > qr.y && box.top < qr.y + qr.size;
              expect(overlapsQr, `${label} ${element.text}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('breaks words that are wider than the line on their own', () => {
    const lines = wrapText('Siehe https://example.org/ein/sehr/langer/pfad/zum/turnier', 40, 4.3, 400, approximateMeasure);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(approximateMeasure(line, 4.3)).toBeLessThanOrEqual(40);
  });

  it('keeps text readable on a light accent color', () => {
    const scene = buildFlyerScene(tournament, { templateId: 'modern', accentColor: '#ffe600' }, 'de', t);
    const title = scene.elements.find((element) => element.text === 'Herbstturnier');
    expect(title.color).toBe('#172033');
    const label = scene.elements.find((element) => element.text === 'ORT');
    expect(label.color).not.toBe('#ffe600');
  });

  it('draws the logo in its original proportions', () => {
    const scene = buildFlyerScene(tournament, { templateId: 'sporty' }, 'de', t, { logo: { width: 400, height: 100 } });
    const logo = scene.elements.find((element) => element.type === 'image');
    expect(logo.width / logo.height).toBeCloseTo(4);
  });

  it('puts the product attribution into every template footer', () => {
    for (const templateId of FLYER_TEMPLATES) {
      const scene = buildFlyerScene(tournament, { templateId }, 'de', t);
      expect(scene.elements.some((element) => element.text === 'Powered by Petanque Turnier Manager Online'), templateId).toBe(true);
    }
  });
});
