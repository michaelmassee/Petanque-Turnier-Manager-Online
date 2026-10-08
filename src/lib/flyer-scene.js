import { formatDateLong, formatMoney, formatTournamentDateTime } from './format.js';
import { formationLabel, labelFor, registrationStatusLabel } from './domain.js';
import { REGISTRATION_TYPES, TOURNAMENT_TYPES } from './constants.js';
import { sanitizeFlyerConfig } from './flyer-config.js';
import { richTextNode, stackNode, textNode } from './flyer-text.js';
import { richTextPlainText } from './rich-text.js';

// Alle Maße in mm. Die Scene ist das einzige Layout: SVG-Vorschau, PNG und PDF zeichnen nur ihre Elemente
// ('path' für alle Formen, 'text' für von satori gesetzte Textblöcke, 'image' für das Logo, 'qr').
const SIZES = { a4: { width: 210, height: 297 }, a5: { width: 148, height: 210 } };

const PALETTES = {
  modern: { text: '#172033', muted: '#4b5565', paper: '#ffffff' },
  sporty: { text: '#10241a', muted: '#41564a', paper: '#ffffff', field: '#0f3b28', fieldDeep: '#0a2a1c' },
  classic: { text: '#2b2418', muted: '#6b5d45', paper: '#f8f3e6', frame: '#b9a57a' },
  background: { text: '#172033', muted: '#344152', paper: '#ffffff' },
};
const SAND = { base: '#efe3c4', edge: '#dcc89a', grains: ['#d6c294', '#c8b07c', '#e9dcb8', '#b89d68'] };
const STEEL = { base: '#59616b', mid: '#7d8791', light: '#aeb7c0', groove: '#353b43', rim: '#2c3138' };
const WOOD = { base: '#c46f24', light: '#f0a858', rim: '#8a4a14' };

// ---------------------------------------------------------------------------------------------
// Geometrie
// ---------------------------------------------------------------------------------------------

const n = (value) => +value.toFixed(3);

function circlePath(cx, cy, r) {
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}

function ellipsePath(cx, cy, rx, ry) {
  return `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

function rectPath(x, y, width, height, radius = 0) {
  if (!radius) return `M${n(x)} ${n(y)}H${n(x + width)}V${n(y + height)}H${n(x)}Z`;
  const r = Math.min(radius, width / 2, height / 2);
  return `M${n(x + r)} ${n(y)}H${n(x + width - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + width)} ${n(y + r)}`
    + `V${n(y + height - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + width - r)} ${n(y + height)}`
    + `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + height - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}

function polygonPath(points) {
  return `${points.map(([x, y], index) => `${index ? 'L' : 'M'}${n(x)} ${n(y)}`).join('')}Z`;
}

function linePath(x1, y1, x2, y2) {
  return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
}

const shape = (d, style) => ({ type: 'path', d, ...style });

// Deterministischer Zufall, damit Kies und Vorschau bei jedem Rendern gleich aussehen.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Farben
// ---------------------------------------------------------------------------------------------

function rgbOf(hex) {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex, target, amount) {
  const from = rgbOf(hex);
  const to = rgbOf(target);
  return `#${from.map((value, index) => Math.round(value + (to[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** Lesbare Schriftfarbe auf einer Fläche in `background`. */
function textOn(background) {
  return luminance(background) > 0.42 ? '#172033' : '#ffffff';
}

/** Akzentfarbe, abgedunkelt bis sie als Schrift auf hellem Papier lesbar ist. */
function readableAccent(accent) {
  let color = accent;
  for (let step = 0; step < 6 && luminance(color) > 0.22; step += 1) color = mix(color, '#000000', 0.2);
  return color;
}

// ---------------------------------------------------------------------------------------------
// Pétanque-Motive
// ---------------------------------------------------------------------------------------------

function groundShadow(cx, bottom, r) {
  return shape(ellipsePath(cx + r * 0.12, bottom - r * 0.04, r * 0.95, r * 0.2), { fill: '#000000', opacity: 0.16 });
}

/** Stahlkugel mit Schattierung, den typischen Rillen und Glanzlicht. */
function boule(cx, cy, r, { shadow = true } = {}) {
  const elements = [];
  if (shadow) elements.push(groundShadow(cx, cy + r, r));
  elements.push(shape(circlePath(cx, cy, r), { fill: STEEL.base }));
  elements.push(shape(circlePath(cx - r * 0.1, cy - r * 0.1, r * 0.84), { fill: STEEL.mid }));
  elements.push(shape(circlePath(cx - r * 0.24, cy - r * 0.26, r * 0.52), { fill: STEEL.light, opacity: 0.85 }));
  for (const offset of [-0.34, 0.3]) {
    const y = cy + offset * r;
    const half = Math.sqrt(1 - offset * offset) * r * 0.97;
    elements.push(shape(`M${n(cx - half)} ${n(y)}Q${n(cx)} ${n(y + r * 0.3)} ${n(cx + half)} ${n(y)}`, {
      stroke: STEEL.groove, strokeWidth: r * 0.06, opacity: 0.75, lineCap: 'round',
    }));
  }
  elements.push(shape(circlePath(cx - r * 0.34, cy - r * 0.38, r * 0.17), { fill: '#ffffff', opacity: 0.9 }));
  elements.push(shape(circlePath(cx, cy, r), { stroke: STEEL.rim, strokeWidth: r * 0.035 }));
  return elements;
}

/** Holz-Zielkugel (Cochonnet). */
function cochonnet(cx, cy, r, { shadow = true } = {}) {
  return [
    ...(shadow ? [groundShadow(cx, cy + r, r)] : []),
    shape(circlePath(cx, cy, r), { fill: WOOD.base }),
    shape(circlePath(cx - r * 0.22, cy - r * 0.22, r * 0.55), { fill: WOOD.light, opacity: 0.9 }),
    shape(circlePath(cx - r * 0.35, cy - r * 0.38, r * 0.18), { fill: '#ffffff', opacity: 0.85 }),
    shape(circlePath(cx, cy, r), { stroke: WOOD.rim, strokeWidth: r * 0.08 }),
  ];
}

/** Sandiger Boden mit Kies – der Spielplatz als Fußbereich. */
function gravel(x, y, width, height, s, seed = 7) {
  const random = seededRandom(seed);
  const elements = [shape(rectPath(x, y, width, height), { fill: SAND.base })];
  const count = Math.round((width * height) / (32 * s * s));
  for (let index = 0; index < count; index += 1) {
    const r = (0.22 + random() * 0.5) * s;
    elements.push(shape(circlePath(x + random() * width, y + r + random() * (height - 2 * r), r), {
      fill: SAND.grains[Math.floor(random() * SAND.grains.length)], opacity: 0.85,
    }));
  }
  elements.push(shape(linePath(x, y, x + width, y), { stroke: SAND.edge, strokeWidth: 0.8 * s }));
  return elements;
}

// ---------------------------------------------------------------------------------------------
// Text (gesetzt von satori, siehe flyer-text.js)
// ---------------------------------------------------------------------------------------------

/** Element für einen gesetzten Textblock an Position x/top (mm). */
function textElement(x, top, block) {
  return { type: 'text', x: n(x), y: n(top), width: n(block.width), height: n(block.height), markup: block.markup };
}

/** Setzt einen Textblock ab Oberkante `top` in die Breite `width`; liefert die Unterkante. */
async function placeText(elements, ctx, node, { x, top, width }) {
  const block = await ctx.typeset(node, width);
  elements.push(textElement(x, top, block));
  return top + block.height;
}

const hasRichText = (value) => Boolean(richTextPlainText(value).trim());

// ---------------------------------------------------------------------------------------------
// Inhalte
// ---------------------------------------------------------------------------------------------

function feeLines(tournament, language) {
  const tiers = (tournament.feeTiers || []).filter((tier) => tier.active !== false);
  if (tiers.length) return tiers.map((tier) => `${tier.name}: ${formatMoney(tier.amountCents, tournament.currency, language)}`);
  if (Number(tournament.entryFeeCents || 0) > 0) return [formatMoney(tournament.entryFeeCents, tournament.currency, language)];
  return [];
}

/** Datum (als Blickfang) und die übrigen Angaben für das Raster. */
function collectContent(tournament, visible, language, t) {
  const highlight = visible.has('date') && tournament.date
    ? { date: formatDateLong(tournament.date, language), time: tournament.startTime || '' }
    : null;
  const facts = [];
  if (visible.has('location') && tournament.location) facts.push({ label: t('Ort'), values: [tournament.location] });
  if (visible.has('formation')) {
    const value = [formationLabel(tournament), labelFor(REGISTRATION_TYPES, tournament.registrationType), labelFor(TOURNAMENT_TYPES, tournament.type)].filter(Boolean).join(' · ');
    facts.push({ label: t('Turnier'), values: [value] });
  }
  if (visible.has('fees')) {
    const values = feeLines(tournament, language);
    if (values.length) facts.push({ label: t('Startgeld'), values });
  }
  if (visible.has('capacity') && tournament.maxRegistrations) facts.push({ label: t('Kapazität'), values: [t('Maximal {count} Anmeldungen').replace('{count}', String(tournament.maxRegistrations))] });
  if (visible.has('deadline') && tournament.registrationDeadline) facts.push({ label: t('Anmeldeschluss'), values: [formatTournamentDateTime(tournament.registrationDeadline, language, tournament.timezone)] });
  if (visible.has('status')) facts.push({ label: t('Status'), values: [registrationStatusLabel(tournament, language)] });
  // Die Beschreibung behält ihre Formatierungen und bekommt die volle Breite.
  if (visible.has('description') && hasRichText(tournament.description)) facts.push({ label: t('Beschreibung'), rich: tournament.description, values: [], wide: true });
  return {
    highlight,
    facts: facts.map((fact) => ({ ...fact, values: fact.values.filter(Boolean) })).filter((fact) => fact.values.length || fact.rich),
  };
}

/** Angaben als Raster mit zwei Spalten (breite Angaben über beide); Beschriftung in Akzentfarbe, darunter der Wert. */
async function factGrid(elements, ctx, facts, { x, width, top, columns, gap, colors, align, bullet }) {
  const { m } = ctx;
  const indent = bullet ? m.label * 1.9 : 0;
  const rows = [];
  for (const fact of facts) {
    const last = rows[rows.length - 1];
    if (fact.wide || !last || last.length >= columns || last[0].wide) rows.push([fact]);
    else last.push(fact);
  }
  let rowTop = top;
  let bottom = top;
  for (const row of rows) {
    const rowColumns = row[0].wide ? 1 : columns;
    const columnWidth = (width - gap * (rowColumns - 1)) / rowColumns;
    let rowEnd = rowTop;
    for (const [column, fact] of row.entries()) {
      const columnX = x + column * (columnWidth + gap);
      if (bullet) elements.push(...bullet(columnX + m.label * 0.6, rowTop + m.label * 0.75, m.label * 0.6));
      const value = fact.rich
        ? richTextNode(fact.rich, { size: m.value, color: colors.value, align, lineHeight: 1.3 })
        : stackNode(fact.values.map((line) => textNode(line, { size: m.value, color: colors.value, align, lineHeight: 1.3 })));
      const node = stackNode([textNode(fact.label.toLocaleUpperCase(ctx.language), { size: m.label, weight: 700, color: colors.label, align, lineHeight: 1.5 }), value], { gap: 0.3 * m.s });
      const end = await placeText(elements, ctx, node, { x: columnX + indent, top: rowTop, width: columnWidth - indent });
      rowEnd = Math.max(rowEnd, end);
      bottom = Math.max(bottom, end);
    }
    rowTop = rowEnd + m.value * 1.15;
  }
  return bottom;
}

/**
 * Setzt den Inhaltsbereich (Datum + Raster) und schiebt ihn bei freiem Platz etwas nach unten,
 * damit keine große Lücke über dem Fußbereich bleibt. `layout(target, top)` liefert die Unterkante.
 */
async function placeBody(elements, layout, top, limit, s) {
  const probeBottom = await layout([], top);
  const free = limit - probeBottom;
  const offset = free > 0 ? Math.min(free * 0.45, 40 * s) : 0;
  return layout(elements, top + offset);
}

const QR_CARD_PAD = 3;
const QR_CAPTION = 3.1;

function cardSize(qrSize, s) {
  return { width: qrSize + 2 * QR_CARD_PAD * s, height: qrSize + 2 * QR_CARD_PAD * s + QR_CAPTION * s * 1.5 };
}

/** QR-Code auf weißer Karte mit Aufforderung darunter. */
async function qrCard(elements, ctx, { x, y, qrSize, s, caption, captionColor }) {
  const pad = QR_CARD_PAD * s;
  const { width, height } = cardSize(qrSize, s);
  elements.push(shape(rectPath(x + 0.6 * s, y + 0.9 * s, width, height, 2.5 * s), { fill: '#000000', opacity: 0.12 }));
  elements.push(shape(rectPath(x, y, width, height, 2.5 * s), { fill: '#ffffff' }));
  elements.push({ type: 'qr', x: n(x + pad), y: n(y + pad), size: n(qrSize) });
  await placeText(elements, ctx, textNode(caption, { size: QR_CAPTION * s, weight: 700, color: captionColor, align: 'center', lineHeight: 1.2 }), {
    x, top: y + pad + qrSize + pad * 0.1, width,
  });
}

function logoBox(logo, maxWidth, maxHeight) {
  if (!(logo?.width > 0 && logo?.height > 0)) return null;
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  return { width: logo.width * scale, height: logo.height * scale };
}

// ---------------------------------------------------------------------------------------------
// Vorlagen
// ---------------------------------------------------------------------------------------------

function metricsFor(page) {
  const s = page.width / 210;
  return {
    s,
    margin: 15 * s,
    kicker: 3.6 * s,
    title: 15 * s,
    subtitle: 5 * s,
    date: 7.2 * s,
    time: 5.4 * s,
    label: Math.max(3.2 * s, 2.4),
    value: 4.9 * s,
    note: Math.max(4 * s, 3),
    qr: 40 * s,
  };
}

/** Zusatztext mit seinen Formatierungen (fett, kursiv, Listen …) gesetzt für die verfügbare Breite. */
async function noteBlock(ctx, { width, color, align = 'left' }) {
  if (!hasRichText(ctx.design.additionalText)) return null;
  return ctx.typeset(richTextNode(ctx.design.additionalText, { size: ctx.m.note, color, align, lineHeight: 1.4 }), width);
}

/** Dezente Markenzeile am unteren Blattrand, unabhängig von Zusatztext und QR-Karte. */
async function poweredBy(elements, ctx, color) {
  const { page, m, t } = ctx;
  const size = Math.max(2.1 * m.s, 1.7);
  await placeText(elements, ctx, textNode(t('Powered by Petanque Turnier Manager Online'), { size, color, align: 'center', lineHeight: 1, opacity: 0.86 }), {
    x: 0, top: page.height - 4.4 * m.s - size * 0.8, width: page.width,
  });
}

/** Fußbereich links Zusatztext, rechts QR-Karte; liefert die Oberkante des Bereichs. */
async function footerRow(elements, ctx, { noteColor, background }) {
  const { page, m, t } = ctx;
  const { s } = m;
  const card = cardSize(m.qr, s);
  const cardX = page.width - m.margin - card.width;
  const notes = await noteBlock(ctx, { width: cardX - m.margin - 6 * s, color: noteColor });
  const contentTop = page.height - m.margin * 0.8 - Math.max(card.height, notes ? notes.height + 1.5 * s : 0);
  const bandTop = contentTop - 9 * s;
  background(bandTop);
  if (notes) elements.push(textElement(m.margin, contentTop + 1.5 * s, notes));
  await qrCard(elements, ctx, { x: cardX, y: contentTop, qrSize: m.qr, s, caption: t('Jetzt anmelden'), captionColor: ctx.accentText });
  await poweredBy(elements, ctx, noteColor);
  return bandTop;
}

async function heroText(elements, ctx, { top, color, kickerColor, align = 'left', x, width, reserved = 0, uppercaseTitle = false }) {
  const { m, design, tournament, t, language } = ctx;
  // Neben einem Logo oben rechts bleibt für Dachzeile und Titel nur die restliche Breite.
  const titleWidth = width - reserved;
  let cursor = await placeText(elements, ctx, textNode(t('Pétanque-Turnier').toLocaleUpperCase(language), {
    size: m.kicker, weight: 700, color: kickerColor, align, lineHeight: 1.7,
  }), { x, top, width: titleWidth });
  const rawTitle = design.headline || tournament.name;
  const titleText = uppercaseTitle ? rawTitle.toLocaleUpperCase(language) : rawTitle;
  // Lange Überschriften kleiner setzen, statt den Kopf über die halbe Seite wachsen zu lassen.
  let title = null;
  for (const factor of [1, 0.82, 0.68]) {
    const size = m.title * factor;
    const node = textNode(titleText, { size, weight: 700, color, align, lineHeight: 1.12 });
    title = { node, block: await ctx.typeset(node, titleWidth) };
    if (title.block.height <= size * 1.12 * 2 + 0.5) break;
  }
  elements.push(textElement(x, cursor, title.block));
  cursor += title.block.height;
  if (design.subtitle) {
    cursor = await placeText(elements, ctx, textNode(design.subtitle, { size: m.subtitle, color, align, lineHeight: 1.35, opacity: 0.88 }), {
      x, top: cursor + 2 * m.s, width: titleWidth,
    });
  }
  return cursor;
}

/** Logo auf weißer Karte oben rechts im Kopf; liefert die Breite, die der Kopftext freilassen muss. */
function cornerLogo(elements, ctx) {
  const { m, logo, page } = ctx;
  const { s } = m;
  const box = logoBox(logo, 34 * s, 16 * s);
  if (!box) return 0;
  const pad = 2.2 * s;
  const left = page.width - m.margin - box.width - 2 * pad;
  elements.push(shape(rectPath(left, m.margin * 0.9, box.width + 2 * pad, box.height + 2 * pad, 2 * s), { fill: '#ffffff' }));
  elements.push({ type: 'image', x: n(left + pad), y: n(m.margin * 0.9 + pad), width: n(box.width), height: n(box.height) });
  return box.width + 2 * pad + 7 * s;
}

/** Logo zentriert über dem Kopftext; liefert die neue Oberkante. */
function centeredLogo(elements, ctx, { x, top, width }) {
  const { m, logo } = ctx;
  const box = logoBox(logo, 32 * m.s, 13 * m.s);
  if (!box) return top;
  elements.push({ type: 'image', x: n(x + (width - box.width) / 2), y: n(top), width: n(box.width), height: n(box.height) });
  return top + box.height + 5 * m.s;
}

/** Datum groß, Startzeit in Akzentfarbe – links mit Akzentbalken oder zentriert. */
async function dateHighlight(elements, ctx, { x, width, top, align, color, bar }) {
  const { highlight, m } = ctx;
  if (!highlight) return { top, bottom: top };
  const { s } = m;
  const textX = bar ? x + 5 * s : x;
  const node = stackNode([
    textNode(highlight.date, { size: m.date, weight: 700, color, align, lineHeight: 1.18 }),
    highlight.time && textNode(highlight.time, { size: m.time, weight: 700, color: ctx.accentText, align, lineHeight: 1.3 }),
  ], { gap: 0.8 * s });
  const bottom = await placeText(elements, ctx, node, { x: textX, top, width: bar ? width - 5 * s : width });
  if (bar) elements.push(shape(rectPath(x, top, 1.8 * s, bottom - top, 0.9 * s), { fill: ctx.accent }));
  return { top: bottom + 8 * s, bottom };
}

async function buildModern(elements, ctx) {
  const { page, m, accent, facts, palette } = ctx;
  const { s } = m;
  const contentWidth = page.width - 2 * m.margin;
  const heroColor = textOn(accent);
  const heroIndex = elements.length;

  const reserved = cornerLogo(elements, ctx);
  const textBottom = await heroText(elements, ctx, { top: m.margin * 1.1, color: heroColor, kickerColor: heroColor, x: m.margin, width: contentWidth, reserved });
  const heroBottom = textBottom + 25 * s;
  const rise = 16 * s;
  // Kopf in Akzentfarbe mit schräger Kante und angedeuteten Wurfkreisen.
  const ringCenter = [page.width - 20 * s, 14 * s];
  elements.splice(heroIndex, 0,
    shape(polygonPath([[0, 0], [page.width, 0], [page.width, heroBottom - rise], [0, heroBottom]]), { fill: accent }),
    ...[36, 54, 72].map((radius, index) => shape(circlePath(...ringCenter, radius * s), {
      stroke: heroColor, strokeWidth: 1.2 * s, opacity: [0.16, 0.11, 0.07][index],
    })));

  // Drei Kugeln und das Cochonnet liegen auf der schrägen Kante.
  const edgeY = (x) => heroBottom - (rise * x) / page.width;
  const right = page.width - m.margin;
  const balls = [
    { cx: right - 86 * s, r: 11 * s },
    { cx: right - 18 * s, r: 18 * s },
    { cx: right - 49 * s, r: 14.5 * s },
  ];
  let compositionBottom = 0;
  for (const ball of balls) {
    const cy = edgeY(ball.cx) + ball.r * 0.5;
    elements.push(...boule(ball.cx, cy, ball.r));
    compositionBottom = Math.max(compositionBottom, cy + ball.r);
  }
  const jackX = right - 68 * s;
  const jackY = edgeY(jackX) + 11 * s;
  elements.push(...cochonnet(jackX, jackY, 4.2 * s));
  compositionBottom = Math.max(compositionBottom, jackY + 4.2 * s);

  const footerTop = await footerRow(elements, ctx, {
    noteColor: '#4a3f2a',
    background: (bandTop) => elements.push(...gravel(0, bandTop, page.width, page.height - bandTop, s)),
  });
  const limit = footerTop - 6 * s;
  const bodyBottom = await placeBody(elements, async (target, bodyTop) => {
    const afterDate = await dateHighlight(target, ctx, { x: m.margin, width: contentWidth, top: bodyTop, color: palette.text, bar: true });
    const grid = await factGrid(target, ctx, facts, {
      x: m.margin, width: contentWidth, top: afterDate.top, columns: 2, gap: 9 * s, align: 'left',
      colors: { label: ctx.accentText, value: palette.text },
      bullet: (cx, cy, r) => [shape(circlePath(cx, cy, r), { fill: ctx.accentText }), shape(circlePath(cx - r * 0.3, cy - r * 0.3, r * 0.35), { fill: '#ffffff', opacity: 0.7 })],
    });
    return Math.max(afterDate.bottom, grid);
  }, Math.max(heroBottom + 10 * s, compositionBottom + 9 * s), limit, s);
  return { bodyBottom, limit };
}

async function buildSporty(elements, ctx) {
  const { page, m, accent, facts, palette } = ctx;
  const { s } = m;
  const contentWidth = page.width - 2 * m.margin;
  const heroIndex = elements.length;
  // Rechts bleibt Platz für Streifen und Kugel, damit sie den Kopftext nicht kreuzen.
  const reserved = Math.max(cornerLogo(elements, ctx), 52 * s);
  const textBottom = await heroText(elements, ctx, {
    top: m.margin * 1.1, color: '#ffffff', kickerColor: mix(accent, '#ffffff', 0.35), x: m.margin, width: contentWidth, reserved, uppercaseTitle: true,
  });
  const heroBottom = textBottom + 24 * s;

  // Dunkles Spielfeld mit Diagonalstreifen in Akzentfarbe.
  const slant = heroBottom * 0.22;
  const stripes = [0, 1, 2].map((index) => {
    const x = page.width - (44 - index * 15) * s + slant;
    return shape(polygonPath([[x, 0], [x + 10 * s, 0], [x + 10 * s - slant, heroBottom], [x - slant, heroBottom]]), {
      fill: accent, opacity: [0.85, 0.55, 0.3][index],
    });
  });
  elements.splice(heroIndex, 0,
    shape(rectPath(0, 0, page.width, heroBottom), { fill: palette.field }),
    shape(rectPath(0, heroBottom - 20 * s, page.width, 20 * s), { fill: palette.fieldDeep, opacity: 0.6 }),
    ...stripes,
    shape(rectPath(0, heroBottom, page.width, 3 * s), { fill: accent }));

  // Kugel im Flug mit Bewegungsstreifen.
  const r = 19 * s;
  const cx = page.width - m.margin - r;
  const cy = heroBottom - r * 0.2;
  [0.5, 0, -0.5].forEach((offset, index) => {
    const y = cy + offset * r;
    const length = [24, 38, 24][index] * s;
    elements.push(shape(linePath(cx - r - 4 * s - length, y, cx - r - 4 * s, y), {
      stroke: accent, strokeWidth: 1.8 * s, opacity: index === 1 ? 0.95 : 0.6, lineCap: 'round',
    }));
  });
  elements.push(...boule(cx, cy, r, { shadow: false }));

  const footerTop = await footerRow(elements, ctx, {
    noteColor: '#ffffff',
    background: (bandTop) => {
      elements.push(shape(rectPath(0, bandTop, page.width, page.height - bandTop), { fill: palette.field }));
      elements.push(shape(rectPath(0, bandTop, page.width, 3 * s), { fill: accent }));
    },
  });
  const limit = footerTop - 6 * s;
  const bodyBottom = await placeBody(elements, async (target, bodyTop) => {
    const afterDate = await dateHighlight(target, ctx, { x: m.margin, width: contentWidth, top: bodyTop, color: palette.text, bar: true });
    const grid = await factGrid(target, ctx, facts, {
      x: m.margin, width: contentWidth, top: afterDate.top, columns: 2, gap: 9 * s, align: 'left',
      colors: { label: ctx.accentText, value: palette.text },
      bullet: (bx, by, br) => [shape(polygonPath([[bx - br, by + br], [bx - br * 0.2, by - br], [bx + br, by - br], [bx + br * 0.2, by + br]]), { fill: ctx.accentText })],
    });
    return Math.max(afterDate.bottom, grid);
  }, Math.max(heroBottom + 12 * s, cy + r + 8 * s), limit, s);
  return { bodyBottom, limit };
}

function ornament(elements, cx, cy, s, color) {
  const r = 4.4 * s;
  elements.push(shape(linePath(cx - 58 * s, cy, cx - 19 * s, cy), { stroke: color, strokeWidth: 0.6 * s }));
  elements.push(shape(linePath(cx + 19 * s, cy, cx + 58 * s, cy), { stroke: color, strokeWidth: 0.6 * s }));
  elements.push(shape(circlePath(cx - 61 * s, cy, 0.9 * s), { fill: color }));
  elements.push(shape(circlePath(cx + 61 * s, cy, 0.9 * s), { fill: color }));
  elements.push(...boule(cx - 10 * s, cy, r, { shadow: false }));
  elements.push(...boule(cx + 10 * s, cy, r, { shadow: false }));
  elements.push(...cochonnet(cx, cy + 2.4 * s, 1.8 * s, { shadow: false }));
}

async function buildClassic(elements, ctx) {
  const { page, m, facts, palette } = ctx;
  const { s } = m;
  const inset = 7 * s;
  elements.push(shape(rectPath(inset, inset, page.width - 2 * inset, page.height - 2 * inset), { stroke: ctx.accentText, strokeWidth: 0.9 * s }));
  elements.push(shape(rectPath(inset + 2 * s, inset + 2 * s, page.width - 2 * inset - 4 * s, page.height - 2 * inset - 4 * s), { stroke: palette.frame, strokeWidth: 0.35 * s }));
  // Eckzier: kleine Kugeln in den Rahmenecken.
  for (const [x, y] of [[inset + 2 * s, inset + 2 * s], [page.width - inset - 2 * s, inset + 2 * s], [inset + 2 * s, page.height - inset - 2 * s], [page.width - inset - 2 * s, page.height - inset - 2 * s]]) {
    elements.push(...boule(x, y, 2.6 * s, { shadow: false }));
  }

  const x = m.margin + 4 * s;
  const width = page.width - 2 * x;
  const top = centeredLogo(elements, ctx, { x, top: m.margin + 5 * s, width });
  const textBottom = await heroText(elements, ctx, { top, color: palette.text, kickerColor: ctx.accentText, align: 'center', x, width });
  const ornamentY = textBottom + 10 * s;
  ornament(elements, page.width / 2, ornamentY, s, palette.frame);

  // Fußbereich zentriert: Zusatztext, darunter die QR-Karte.
  const card = cardSize(m.qr, s);
  const notes = await noteBlock(ctx, { width, color: palette.muted, align: 'center' });
  const cardY = page.height - m.margin - 5 * s - card.height;
  const notesTop = cardY - (notes ? notes.height + 4 * s : 0);
  if (notes) elements.push(textElement(x, notesTop, notes));
  await qrCard(elements, ctx, { x: (page.width - card.width) / 2, y: cardY, qrSize: m.qr, s, caption: ctx.t('Jetzt anmelden'), captionColor: ctx.accentText });
  await poweredBy(elements, ctx, palette.muted);
  const separatorY = notesTop - 7 * s;
  elements.push(shape(linePath(page.width / 2 - 34 * s, separatorY, page.width / 2 + 34 * s, separatorY), { stroke: palette.frame, strokeWidth: 0.6 * s }));
  const limit = separatorY - 5 * s;

  const bodyBottom = await placeBody(elements, async (target, bodyTop) => {
    const afterDate = await dateHighlight(target, ctx, { x, width, top: bodyTop, align: 'center', color: palette.text, bar: false });
    const grid = await factGrid(target, ctx, facts, {
      x, width, top: afterDate.top, columns: 2, gap: 9 * s, align: 'center', colors: { label: ctx.accentText, value: palette.text },
    });
    return Math.max(afterDate.bottom, grid);
  }, ornamentY + 11 * s, limit, s);
  return { bodyBottom, limit };
}

async function buildBackground(elements, ctx) {
  const { page, m, facts, palette } = ctx;
  const { s } = m;
  const contentWidth = page.width - 2 * m.margin;
  // Das Hintergrundbild liegt unter dem dunklen Overlay und wird erst im Renderer aus den lokalen Daten ergänzt.
  elements.push({ type: 'background' });
  elements.push(shape(rectPath(0, 0, page.width, page.height), { fill: '#07131f', opacity: 0.62 }));
  const reserved = cornerLogo(elements, ctx);
  const textBottom = await heroText(elements, ctx, {
    top: m.margin * 1.1, color: '#ffffff', kickerColor: '#ffffff', x: m.margin, width: contentWidth, reserved,
  });
  const footerTop = await footerRow(elements, ctx, {
    noteColor: '#ffffff',
    background: (bandTop) => elements.push(shape(rectPath(0, bandTop, page.width, page.height - bandTop), { fill: '#07131f', opacity: 0.76 })),
  });
  const limit = footerTop - 6 * s;
  const bodyTop = textBottom + 15 * s;
  // Die mittige Informations-Textbox bleibt lesbar, ihre Transparenz ist im Editor einstellbar.
  elements.push({
    ...shape(rectPath(m.margin - 4 * s, bodyTop - 5 * s, contentWidth + 8 * s, limit - bodyTop + 9 * s, 4 * s), {
      fill: '#ffffff', opacity: (100 - ctx.backgroundPanelTransparency) / 100,
    }),
    role: 'background-textbox',
  });
  const bodyBottom = await placeBody(elements, async (target, top) => {
    const afterDate = await dateHighlight(target, ctx, { x: m.margin, width: contentWidth, top, color: palette.text, bar: true });
    const grid = await factGrid(target, ctx, facts, {
      x: m.margin, width: contentWidth, top: afterDate.top, columns: 2, gap: 9 * s, align: 'left',
      colors: { label: ctx.accentText, value: palette.text },
      bullet: (cx, cy, r) => [shape(circlePath(cx, cy, r), { fill: ctx.accentText })],
    });
    return Math.max(afterDate.bottom, grid);
  }, bodyTop, limit, s);
  return { bodyBottom, limit };
}

const BUILDERS = { modern: buildModern, sporty: buildSporty, classic: buildClassic, background: buildBackground };

/**
 * @param options.typeset (satoriNode, widthMm) => Promise<{ markup, width, height }>, siehe createFlyerTypesetter
 * @param options.logo natürliche Größe des Logos { width, height } oder null
 */
export async function buildFlyerScene(tournament, config, language, t, { typeset, logo = null, background = null, backgroundPanelTransparency = 50 }) {
  const design = sanitizeFlyerConfig(config);
  const page = SIZES[design.format];
  const templateId = background ? 'background' : design.templateId;
  const palette = PALETTES[templateId];
  const accent = design.accentColor;
  const panelTransparency = Math.min(100, Math.max(0, Number(backgroundPanelTransparency) || 0));
  const ctx = {
    page, design, tournament, t, language, logo, palette, accent, typeset,
    backgroundPanelTransparency: panelTransparency,
    accentText: readableAccent(accent),
    m: metricsFor(page),
    ...collectContent(tournament, new Set(design.visibleFields), language, t),
  };
  const elements = [shape(rectPath(0, 0, page.width, page.height), { fill: palette.paper })];
  const { bodyBottom, limit } = await BUILDERS[templateId](elements, ctx);
  return { page, design: { ...design, templateId }, elements, overflow: bodyBottom > limit, bodyBottom, bodyLimit: limit };
}

export function flyerFileName(tournament, format, extension) {
  const slug = String(tournament.name || 'turnier').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'turnier';
  return `${slug}-${tournament.date || 'flyer'}-${format}.${extension}`;
}
