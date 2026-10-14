import { describe, expect, it } from 'vitest';
import { FLYER_TEMPLATES } from './flyer-config.js';
import { buildFlyerScene } from './flyer-scene.js';
import { findTextNode, recordingTypesetter } from './flyer-test-typesetter.js';
import { serializeRichText } from './rich-text.js';

const tournament = { name: 'Herbstturnier', date: '2026-10-20', startTime: '10:00', location: 'Bouleplatz Linden', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'open', feeTiers: [], entryFeeCents: 500, currency: 'EUR', maxRegistrations: 32, registrationDeadline: '2026-10-18T18:00:00Z', timezone: 'Europe/Berlin' };
const t = (value) => value;
const LONG_HEADLINE = 'Großes Herbstturnier des Boule-Clubs Linden mit Abendessen und Siegerehrung';
const LONG_SUBTITLE = 'Offenes Doublette-Turnier für alle Lizenzspielerinnen und Lizenzspieler aus der Region, Gäste sind herzlich willkommen';
const LONG_NOTE = 'Für Verpflegung ist gesorgt.\n'.repeat(30);

async function build(config, options = {}, base = tournament) {
  const typeset = recordingTypesetter();
  const scene = await buildFlyerScene(base, config, 'de', t, { typeset, ...options });
  return { scene, nodes: typeset.nodes };
}

async function buildWithFactPositions(config, options, base) {
  const typeset = recordingTypesetter();
  const labels = ['ORT', 'TURNIER', 'STARTGELD', 'KAPAZITÄT', 'ANMELDESCHLUSS', 'STATUS', 'BESCHREIBUNG'];
  const markups = new Map();
  const scene = await buildFlyerScene(base, config, 'de', t, { ...options, typeset: async (node, width) => {
    const block = await typeset(node, width);
    const label = labels.find((value) => findTextNode([node], value));
    if (label) markups.set(block.markup, label);
    return block;
  } });
  const positions = new Map(scene.elements.filter((element) => element.type === 'text' && markups.has(element.markup))
    .map((element) => [markups.get(element.markup), element]));
  return { scene, positions };
}

describe('flyer scene', () => {
  it('fills the shorter column in every template without waiting for a tall entry on the left', async () => {
    for (const templateId of [...FLYER_TEMPLATES, 'background']) {
      for (const format of ['a4', 'a5']) {
        for (const backgroundHideFooter of templateId === 'background' ? [false, true] : [false]) {
          const { scene, positions } = await buildWithFactPositions({ templateId, format, backgroundHideFooter, visibleFields: ['location', 'formation', 'fees', 'capacity'] },
            templateId === 'background' ? { background: { dataUrl: 'data:image/png;base64,x' } } : {},
            { ...tournament, location: 'Bouleplatz Linden mit Vereinsheim und ausreichend Parkplätzen. '.repeat(3) });
          const location = positions.get('ORT');
          const formation = positions.get('TURNIER');
          const fees = positions.get('STARTGELD');
          const capacity = positions.get('KAPAZITÄT');
          expect(scene.overflow).toBe(false);
          expect(formation.y).toBe(location.y);
          expect(fees.x).toBe(formation.x);
          expect(fees.y).toBeGreaterThanOrEqual(formation.y + formation.height);
          expect(capacity.x).toBe(formation.x);
          expect(capacity.y).toBeGreaterThanOrEqual(fees.y + fees.height);
          expect(capacity.y).toBeLessThan(location.y + location.height);
        }
      }
    }
  });

  it('places the description below both independent columns and keeps the QR card free', async () => {
    for (const format of ['a4', 'a5']) {
      const { scene, positions } = await buildWithFactPositions({ format, backgroundHideFooter: true, visibleFields: ['location', 'formation', 'fees', 'capacity', 'description'], additionalText: 'Kaffee und Kuchen.' },
        { background: { dataUrl: 'data:image/png;base64,x' } },
        { ...tournament, location: 'Bouleplatz Linden mit Vereinsheim. '.repeat(6), description: 'Verpflegung vor Ort.' });
      const description = positions.get('BESCHREIBUNG');
      for (const [label, block] of positions) {
        if (label !== 'BESCHREIBUNG') expect(description.y).toBeGreaterThanOrEqual(block.y + block.height);
      }
      expect(scene.overflow).toBe(false);
      const qr = scene.elements.find((element) => element.type === 'qr');
      for (const block of scene.elements.filter((element) => element.type === 'text')) {
        expect(block.x + block.width > qr.x && block.x < qr.x + qr.size
          && block.y + block.height > qr.y && block.y < qr.y + qr.size).toBe(false);
      }
    }
  });

  it('still reports overflowing background information in both footer modes', async () => {
    for (const backgroundHideFooter of [false, true]) {
      const { scene } = await build({ format: 'a5', backgroundHideFooter }, { background: { dataUrl: 'data:image/png;base64,x' } },
        { ...tournament, location: 'Sehr langer Ortsname mit weiteren Informationen. '.repeat(80) });
      expect(scene.overflow).toBe(true);
      expect(scene.bodyBottom).toBeGreaterThan(scene.bodyLimit);
    }
  });

  it('moves a block to the left when the shorter right column would reach the QR card', async () => {
    for (const format of ['a4', 'a5']) {
      const scale = format === 'a4' ? 1 : 148 / 210;
      // Definierte Blockhöhen isolieren die Entscheidung an der QR-Grenze vom Schriftumbruch.
      const typeset = async (node, width) => {
        const label = ['ORT', 'TURNIER', 'STARTGELD'].find((value) => findTextNode([node], value));
        return { width, height: ({ ORT: 170, TURNIER: 160, STARTGELD: 40 }[label] || 2) * scale, markup: label || '' };
      };
      const scene = await buildFlyerScene(tournament, { format, backgroundHideFooter: true, visibleFields: ['location', 'formation', 'fees'] }, 'de', t,
        { typeset, background: { dataUrl: 'data:image/png;base64,x' } });
      const location = scene.elements.find((element) => element.markup === 'ORT');
      const formation = scene.elements.find((element) => element.markup === 'TURNIER');
      const fees = scene.elements.find((element) => element.markup === 'STARTGELD');
      const qr = scene.elements.find((element) => element.type === 'qr');
      expect(formation.y + formation.height).toBeLessThan(location.y + location.height);
      expect(fees.x).toBe(location.x);
      expect(fees.y).toBeGreaterThan(location.y + location.height);
      expect(fees.y + fees.height).toBeGreaterThan(qr.y);
      expect(fees.x + fees.width).toBeLessThan(qr.x);
      expect(scene.overflow).toBe(false);
    }
  });
  it('uses the real registration capacity wording and A5 dimensions', async () => {
    const { scene, nodes } = await build({ format: 'a5' });
    expect(scene.page).toEqual({ width: 148, height: 210 });
    expect(findTextNode(nodes, 'Maximal 32 Anmeldungen')).not.toBeNull();
  });

  it('reports overflow when the details would reach the footer', async () => {
    for (const templateId of FLYER_TEMPLATES) {
      const { scene } = await build({ templateId, format: 'a5', headline: LONG_HEADLINE, subtitle: LONG_SUBTITLE, additionalText: LONG_NOTE });
      expect(scene.bodyBottom, templateId).toBeGreaterThan(scene.bodyLimit);
      expect(scene.overflow, templateId).toBe(true);
    }
  });

  it('keeps every text block on the page and clear of the QR code whenever no overflow is reported', async () => {
    for (const templateId of FLYER_TEMPLATES) {
      for (const format of ['a4', 'a5']) {
        for (const headline of ['', LONG_HEADLINE]) {
          for (const additionalText of ['', 'Absatz eins\n\nAbsatz zwei mit etwas mehr Text, der umbrochen werden muss.']) {
            const { scene } = await build({ templateId, format, headline, additionalText });
            const label = `${templateId}/${format}/${headline.length}/${additionalText.length}`;
            expect(scene.overflow, label).toBe(false);
            const qr = scene.elements.find((element) => element.type === 'qr');
            for (const block of scene.elements.filter((item) => item.type === 'text')) {
              expect(block.x, label).toBeGreaterThanOrEqual(0);
              expect(block.x + block.width, label).toBeLessThanOrEqual(scene.page.width + 0.01);
              expect(block.y + block.height, label).toBeLessThanOrEqual(scene.page.height + 0.01);
              const overlapsQr = block.x + block.width > qr.x && block.x < qr.x + qr.size && block.y + block.height > qr.y && block.y < qr.y + qr.size;
              expect(overlapsQr, `${label} ${JSON.stringify(block).slice(0, 60)}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('shrinks long headlines to at most two lines', async () => {
    const { nodes } = await build({ format: 'a5', headline: LONG_HEADLINE });
    const sizes = nodes.map((node) => findTextNode([node], LONG_HEADLINE)?.props.style.fontSize).filter(Boolean);
    expect(Math.min(...sizes)).toBeLessThan(Math.max(...sizes));
  });

  it('keeps text readable on a light accent color', async () => {
    const { nodes } = await build({ templateId: 'modern', accentColor: '#ffe600' });
    expect(findTextNode(nodes, 'Herbstturnier').props.style.color).toBe('#172033');
    expect(findTextNode(nodes, 'ORT').props.style.color).not.toBe('#ffe600');
  });

  it('draws the logo in its original proportions', async () => {
    const { scene } = await build({ templateId: 'sporty' }, { logo: { width: 400, height: 100 } });
    const logo = scene.elements.find((element) => element.type === 'image');
    expect(logo.width / logo.height).toBeCloseTo(4);
  });

  it('puts the product attribution into every template footer', async () => {
    for (const templateId of FLYER_TEMPLATES) {
      const { nodes } = await build({ templateId });
      expect(findTextNode(nodes, 'Powered by Petanque Turnier Manager Online'), templateId).not.toBeNull();
    }
  });

  it('uses the configured transparency for the centered background textbox', async () => {
    const { scene } = await build({}, { background: { dataUrl: 'data:image/png;base64,x' }, backgroundPanelTransparency: 50 });
    expect(scene.elements.find((element) => element.role === 'background-textbox').opacity).toBe(0.5);
  });

  it('expands the background information box while preserving the bottom-right QR code and additional text', async () => {
    const background = { dataUrl: 'data:image/png;base64,x' };
    for (const format of ['a4', 'a5']) {
      const normal = await build({ format }, { background });
      const expanded = await build({ format, backgroundHideFooter: true, additionalText: 'Kaffee und Kuchen vor Ort.' }, { background });
      const qr = expanded.scene.elements.find((element) => element.type === 'qr');
      expect(qr).toEqual(normal.scene.elements.find((element) => element.type === 'qr'));
      expect(expanded.scene.bodyLimit).toBeGreaterThan(normal.scene.bodyLimit + 30);
      expect(expanded.scene.overflow).toBe(false);
      expect(findTextNode(expanded.nodes, 'Kaffee und Kuchen vor Ort.')).not.toBeNull();
      expect(findTextNode(expanded.nodes, 'Powered by Petanque Turnier Manager Online')).not.toBeNull();
      const panelIndex = expanded.scene.elements.findIndex((element) => element.role === 'background-textbox');
      expect(expanded.scene.elements.indexOf(qr)).toBeGreaterThan(panelIndex);
      for (const block of expanded.scene.elements.filter((element) => element.type === 'text')) {
        const overlaps = block.x + block.width > qr.x && block.x < qr.x + qr.size
          && block.y + block.height > qr.y && block.y < qr.y + qr.size;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('flows longer information beside the QR card without overlapping it', async () => {
    const { scene } = await build({ format: 'a5', backgroundHideFooter: true, visibleFields: ['description'] },
      { background: { dataUrl: 'data:image/png;base64,x' } },
      { ...tournament, description: 'Verpflegung und Getränke sind vor Ort verfügbar. '.repeat(60) });
    const qr = scene.elements.find((element) => element.type === 'qr');
    const alongside = scene.elements.filter((element) => element.type === 'text' && element.y + element.height > qr.y && element.y < qr.y + qr.size);
    expect(alongside.length).toBeGreaterThan(0);
    for (const block of alongside) expect(block.x + block.width).toBeLessThan(qr.x);
  });

  it('does not hide the footer in built-in templates', async () => {
    for (const templateId of FLYER_TEMPLATES) {
      const normal = await build({ templateId });
      const hidden = await build({ templateId, backgroundHideFooter: true });
      expect(hidden.scene.elements).toEqual(normal.scene.elements);
    }
  });

  it('keeps the formatting of the additional text and the tournament description', async () => {
    const formatted = serializeRichText({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Kaffee', marks: [{ type: 'bold' }] }, { type: 'text', text: ' und ' }, { type: 'text', text: 'Kuchen', marks: [{ type: 'italic' }] },
    ] }] });
    const { nodes } = await build({ additionalText: formatted, visibleFields: ['description'] }, {}, { ...tournament, description: formatted });
    expect(findTextNode(nodes, 'BESCHREIBUNG')).not.toBeNull();
    const bold = nodes.flatMap((node) => [findTextNode([node], 'Kaffee')]).filter(Boolean);
    const italic = nodes.flatMap((node) => [findTextNode([node], 'Kuchen')]).filter(Boolean);
    expect(bold.length).toBeGreaterThanOrEqual(2);
    expect(bold.every((node) => node.props.style.fontWeight === 700)).toBe(true);
    expect(italic.every((node) => node.props.style.fontStyle === 'italic')).toBe(true);
  });

  it('includes the tournament description only when selected', async () => {
    const withDescription = { ...tournament, description: 'Verpflegung und Getränke sind verfügbar.' };
    const shown = await build({ visibleFields: ['description'] }, {}, withDescription);
    expect(findTextNode(shown.nodes, 'BESCHREIBUNG')).not.toBeNull();
    const hidden = await build({ visibleFields: ['location'] }, {}, withDescription);
    expect(findTextNode(hidden.nodes, 'BESCHREIBUNG')).toBeNull();
  });
});
