import { formatDateLong, formatMoney, formatTournamentDateTime } from './format.js';
import { formationLabel, labelFor, registrationStatusLabel } from './domain.js';
import { REGISTRATION_TYPES, TOURNAMENT_TYPES } from './constants.js';
import { sanitizeFlyerConfig } from './flyer-config.js';
import { approximateMeasure } from './flyer-fonts.js';
import { richTextPlainText } from './rich-text.js';

// Alle Maße in mm. Die Scene ist das einzige Layout: SVG-Vorschau, PNG und PDF zeichnen nur ihre Elemente
// ('path' für alle Formen, 'text', 'image' für das Logo, 'qr').
const SIZES = { a4: { width: 210, height: 297 }, a5: { width: 148, height: 210 } };
// Anteil der Schriftgröße über bzw. unter der Grundlinie (Noto Sans).
const ASCENT = 0.8;
const DESCENT = 0.25;

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
// Text
// ---------------------------------------------------------------------------------------------

function breakWord(word, maxWidth, size, weight, measure) {
  const parts = [];
  let part = '';
  for (const char of word) {
    if (part && measure(part + char, size, weight) > maxWidth) {
      parts.push(part);
      part = char;
    } else part += char;
  }
  if (part) parts.push(part);
  return parts;
}

/** Bricht nach gemessener Breite um; Wörter, die allein zu breit sind (URLs, lange Ortsnamen), werden geteilt. */
export function wrapText(text, maxWidth, size, weight, measure) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size, weight) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word, size, weight) <= maxWidth) {
      line = word;
      continue;
    }
    const parts = breakWord(word, maxWidth, size, weight, measure);
    lines.push(...parts.slice(0, -1));
    line = parts[parts.length - 1];
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Setzt Zeilen ab `top` (Oberkante) in eine Spalte und liefert die neue Oberkante sowie die Unterkante
 * der letzten Schrift.
 */
function typeset(elements, measure, lines, { x, width, top, size, lineHeight, weight = 400, color, opacity, align = 'left' }) {
  let cursor = top;
  let bottom = top;
  for (const line of lines) {
    const baseline = cursor + size * ASCENT;
    if (line) {
      const lineX = align === 'center' ? x + (width - measure(line, size, weight)) / 2 : x;
      elements.push({ type: 'text', x: n(lineX), y: n(baseline), size, weight, color, ...(opacity < 1 ? { opacity } : {}), text: line });
      bottom = baseline + size * DESCENT;
    }
    cursor += lineHeight;
  }
  return { top: cursor, bottom };
}

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
  const description = richTextPlainText(tournament.description).trim();
  if (visible.has('description') && description) facts.push({ label: t('Beschreibung'), values: [description] });
  return { highlight, facts: facts.map((fact) => ({ ...fact, values: fact.values.filter(Boolean) })).filter((fact) => fact.values.length) };
}

/** Angaben als Raster mit zwei Spalten; jede Angabe: Beschriftung in Akzentfarbe, darunter der Wert. */
function factGrid(elements, measure, facts, { x, width, top, columns, gap, sizes, colors, align, bullet }) {
  const columnWidth = (width - gap * (columns - 1)) / columns;
  const indent = bullet ? sizes.label * 1.9 : 0;
  let rowTop = top;
  let bottom = top;
  for (let index = 0; index < facts.length; index += columns) {
    let rowEnd = rowTop;
    facts.slice(index, index + columns).forEach((fact, column) => {
      const columnX = x + column * (columnWidth + gap);
      const textX = columnX + indent;
      const textWidth = columnWidth - indent;
      if (bullet) elements.push(...bullet(columnX + sizes.label * 0.6, rowTop + sizes.label * 0.45, sizes.label * 0.6));
      const label = typeset(elements, measure, [fact.label.toLocaleUpperCase()], {
        x: textX, width: textWidth, top: rowTop, size: sizes.label, lineHeight: sizes.label * 1.75, weight: 700, color: colors.label, align,
      });
      const values = fact.values.flatMap((value) => wrapText(value, textWidth, sizes.value, 400, measure));
      const block = typeset(elements, measure, values, {
        x: textX, width: textWidth, top: label.top, size: sizes.value, lineHeight: sizes.value * 1.3, color: colors.value, align,
      });
      rowEnd = Math.max(rowEnd, block.top);
      bottom = Math.max(bottom, block.bottom);
    });
    rowTop = rowEnd + sizes.value * 1.15;
  }
  return bottom;
}

/**
 * Setzt den Inhaltsbereich (Datum + Raster) und schiebt ihn bei freiem Platz etwas nach unten,
 * damit keine große Lücke über dem Fußbereich bleibt. `layout(target, top)` liefert die Unterkante.
 */
function placeBody(elements, layout, top, limit, s) {
  const probeBottom = layout([], top);
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
function qrCard(elements, measure, { x, y, qrSize, s, caption, captionColor }) {
  const pad = QR_CARD_PAD * s;
  const captionSize = QR_CAPTION * s;
  const { width, height } = cardSize(qrSize, s);
  elements.push(shape(rectPath(x + 0.6 * s, y + 0.9 * s, width, height, 2.5 * s), { fill: '#000000', opacity: 0.12 }));
  elements.push(shape(rectPath(x, y, width, height, 2.5 * s), { fill: '#ffffff' }));
  elements.push({ type: 'qr', x: n(x + pad), y: n(y + pad), size: n(qrSize) });
  typeset(elements, measure, [caption], {
    x, width, top: y + pad + qrSize + pad * 0.35, size: captionSize, lineHeight: captionSize, weight: 700, color: captionColor, align: 'center',
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

function noteLinesFor(ctx, width, measure) {
  return richTextPlainText(ctx.design.additionalText).split('\n')
    .flatMap((paragraph) => (paragraph ? wrapText(paragraph, width, ctx.m.note, 400, measure) : ['']));
}

/** Dezente Markenzeile am unteren Blattrand, unabhängig von Zusatztext und QR-Karte. */
function poweredBy(elements, measure, ctx, color) {
  const { page, m, t } = ctx;
  const size = Math.max(2.1 * m.s, 1.7);
  typeset(elements, measure, [t('Powered by Petanque Turnier Manager Online')], {
    x: 0, width: page.width, top: page.height - 4.4 * m.s, size, lineHeight: size, color, opacity: 0.86, align: 'center',
  });
}

/** Fußbereich links Zusatztext, rechts QR-Karte; liefert die Oberkante des Bereichs. */
function footerRow(elements, measure, ctx, { noteColor, background }) {
  const { page, m, t } = ctx;
  const { s } = m;
  const card = cardSize(m.qr, s);
  const cardX = page.width - m.margin - card.width;
  const noteWidth = cardX - m.margin - 6 * s;
  const noteLines = noteLinesFor(ctx, noteWidth, measure);
  const noteHeight = noteLines.length * m.note * 1.4;
  const contentTop = page.height - m.margin * 0.8 - Math.max(card.height, noteHeight);
  const bandTop = contentTop - 9 * s;
  background(bandTop);
  typeset(elements, measure, noteLines, { x: m.margin, width: noteWidth, top: contentTop + 1.5 * s, size: m.note, lineHeight: m.note * 1.4, color: noteColor });
  qrCard(elements, measure, { x: cardX, y: contentTop, qrSize: m.qr, s, caption: t('Jetzt anmelden'), captionColor: ctx.accentText });
  poweredBy(elements, measure, ctx, noteColor);
  return bandTop;
}

function heroText(elements, measure, ctx, { top, color, kickerColor, align = 'left', x, width, reserved = 0, uppercaseTitle = false }) {
  const { m, design, tournament, t, language } = ctx;
  let cursor = top;
  cursor = typeset(elements, measure, [t('Pétanque-Turnier').toLocaleUpperCase(language)], {
    x, width, top: cursor, size: m.kicker, lineHeight: m.kicker * 2.1, weight: 700, color: kickerColor, align,
  }).top;
  const rawTitle = design.headline || tournament.name;
  const titleText = uppercaseTitle ? rawTitle.toLocaleUpperCase(language) : rawTitle;
  // Lange Überschriften kleiner setzen, statt den Kopf über die halbe Seite wachsen zu lassen.
  let titleSize = m.title;
  // Neben einem Logo oben rechts bleibt für Dachzeile und Titel nur die restliche Breite.
  const titleWidth = width - reserved;
  let titleLines = wrapText(titleText, titleWidth, titleSize, 700, measure);
  for (const factor of [0.82, 0.68]) {
    if (titleLines.length <= 2) break;
    titleSize = m.title * factor;
    titleLines = wrapText(titleText, titleWidth, titleSize, 700, measure);
  }
  const title = typeset(elements, measure, titleLines, {
    x, width: titleWidth, top: cursor, size: titleSize, lineHeight: titleSize * 1.12, weight: 700, color, align,
  });
  cursor = title.top + 2 * m.s;
  const subtitle = typeset(elements, measure, wrapText(design.subtitle, titleWidth, m.subtitle, 400, measure), {
    x, width: titleWidth, top: cursor, size: m.subtitle, lineHeight: m.subtitle * 1.35, color, opacity: 0.88, align,
  });
  return Math.max(title.bottom, subtitle.bottom);
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
function dateHighlight(elements, measure, ctx, { x, width, top, align, color, bar }) {
  const { highlight, m } = ctx;
  if (!highlight) return { top, bottom: top };
  const { s } = m;
  const textX = bar ? x + 5 * s : x;
  const textWidth = bar ? width - 5 * s : width;
  const date = typeset(elements, measure, wrapText(highlight.date, textWidth, m.date, 700, measure), {
    x: textX, width: textWidth, top, size: m.date, lineHeight: m.date * 1.18, weight: 700, color, align,
  });
  const time = typeset(elements, measure, highlight.time ? [highlight.time] : [], {
    x: textX, width: textWidth, top: date.top + 0.8 * s, size: m.time, lineHeight: m.time * 1.3, weight: 700, color: ctx.accentText, align,
  });
  const bottom = Math.max(date.bottom, time.bottom);
  if (bar) elements.push(shape(rectPath(x, top, 1.8 * s, bottom - top, 0.9 * s), { fill: ctx.accent }));
  return { top: bottom + 8 * s, bottom };
}

function buildModern(elements, measure, ctx) {
  const { page, m, accent, facts, palette } = ctx;
  const { s } = m;
  const contentWidth = page.width - 2 * m.margin;
  const heroColor = textOn(accent);
  const heroIndex = elements.length;

  const reserved = cornerLogo(elements, ctx);
  const textBottom = heroText(elements, measure, ctx, { top: m.margin * 1.1, color: heroColor, kickerColor: heroColor, x: m.margin, width: contentWidth, reserved });
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

  const footerTop = footerRow(elements, measure, ctx, {
    noteColor: '#4a3f2a',
    background: (bandTop) => elements.push(...gravel(0, bandTop, page.width, page.height - bandTop, s)),
  });
  const limit = footerTop - 6 * s;
  const bodyBottom = placeBody(elements, (target, bodyTop) => {
    const afterDate = dateHighlight(target, measure, ctx, { x: m.margin, width: contentWidth, top: bodyTop, color: palette.text, bar: true });
    const grid = factGrid(target, measure, facts, {
      x: m.margin, width: contentWidth, top: afterDate.top, columns: 2, gap: 9 * s, align: 'left',
      sizes: m, colors: { label: ctx.accentText, value: palette.text },
      bullet: (cx, cy, r) => [shape(circlePath(cx, cy, r), { fill: ctx.accentText }), shape(circlePath(cx - r * 0.3, cy - r * 0.3, r * 0.35), { fill: '#ffffff', opacity: 0.7 })],
    });
    return Math.max(afterDate.bottom, grid);
  }, Math.max(heroBottom + 10 * s, compositionBottom + 9 * s), limit, s);
  return { bodyBottom, limit };
}

function buildSporty(elements, measure, ctx) {
  const { page, m, accent, facts, palette } = ctx;
  const { s } = m;
  const contentWidth = page.width - 2 * m.margin;
  const heroIndex = elements.length;
  // Rechts bleibt Platz für Streifen und Kugel, damit sie den Kopftext nicht kreuzen.
  const reserved = Math.max(cornerLogo(elements, ctx), 52 * s);
  const textBottom = heroText(elements, measure, ctx, {
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

  const footerTop = footerRow(elements, measure, ctx, {
    noteColor: '#ffffff',
    background: (bandTop) => {
      elements.push(shape(rectPath(0, bandTop, page.width, page.height - bandTop), { fill: palette.field }));
      elements.push(shape(rectPath(0, bandTop, page.width, 3 * s), { fill: accent }));
    },
  });
  const limit = footerTop - 6 * s;
  const bodyBottom = placeBody(elements, (target, bodyTop) => {
    const afterDate = dateHighlight(target, measure, ctx, { x: m.margin, width: contentWidth, top: bodyTop, color: palette.text, bar: true });
    const grid = factGrid(target, measure, facts, {
      x: m.margin, width: contentWidth, top: afterDate.top, columns: 2, gap: 9 * s, align: 'left',
      sizes: m, colors: { label: ctx.accentText, value: palette.text },
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

function buildClassic(elements, measure, ctx) {
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
  const textBottom = heroText(elements, measure, ctx, { top, color: palette.text, kickerColor: ctx.accentText, align: 'center', x, width });
  const ornamentY = textBottom + 10 * s;
  ornament(elements, page.width / 2, ornamentY, s, palette.frame);

  // Fußbereich zentriert: Zusatztext, darunter die QR-Karte.
  const card = cardSize(m.qr, s);
  const noteLines = noteLinesFor(ctx, width, measure);
  const noteHeight = noteLines.length * m.note * 1.4;
  const cardY = page.height - m.margin - 5 * s - card.height;
  const notesTop = cardY - (noteLines.length ? noteHeight + 4 * s : 0);
  typeset(elements, measure, noteLines, { x, width, top: notesTop, size: m.note, lineHeight: m.note * 1.4, color: palette.muted, align: 'center' });
  qrCard(elements, measure, { x: (page.width - card.width) / 2, y: cardY, qrSize: m.qr, s, caption: ctx.t('Jetzt anmelden'), captionColor: ctx.accentText });
  poweredBy(elements, measure, ctx, palette.muted);
  const separatorY = notesTop - 7 * s;
  elements.push(shape(linePath(page.width / 2 - 34 * s, separatorY, page.width / 2 + 34 * s, separatorY), { stroke: palette.frame, strokeWidth: 0.6 * s }));
  const limit = separatorY - 5 * s;

  const bodyBottom = placeBody(elements, (target, bodyTop) => {
    const afterDate = dateHighlight(target, measure, ctx, { x, width, top: bodyTop, align: 'center', color: palette.text, bar: false });
    const grid = factGrid(target, measure, facts, {
      x, width, top: afterDate.top, columns: 2, gap: 9 * s, align: 'center', sizes: m, colors: { label: ctx.accentText, value: palette.text },
    });
    return Math.max(afterDate.bottom, grid);
  }, ornamentY + 11 * s, limit, s);
  return { bodyBottom, limit };
}

function buildBackground(elements, measure, ctx) {
  const { page, m, facts, palette } = ctx;
  const { s } = m;
  const contentWidth = page.width - 2 * m.margin;
  // Das Hintergrundbild liegt unter dem dunklen Overlay und wird erst im Renderer aus den lokalen Daten ergänzt.
  elements.push({ type: 'background' });
  elements.push(shape(rectPath(0, 0, page.width, page.height), { fill: '#07131f', opacity: 0.62 }));
  const reserved = cornerLogo(elements, ctx);
  const textBottom = heroText(elements, measure, ctx, {
    top: m.margin * 1.1, color: '#ffffff', kickerColor: '#ffffff', x: m.margin, width: contentWidth, reserved,
  });
  const footerTop = footerRow(elements, measure, ctx, {
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
  const bodyBottom = placeBody(elements, (target, top) => {
    const afterDate = dateHighlight(target, measure, ctx, { x: m.margin, width: contentWidth, top, color: palette.text, bar: true });
    const grid = factGrid(target, measure, facts, {
      x: m.margin, width: contentWidth, top: afterDate.top, columns: 2, gap: 9 * s, align: 'left',
      sizes: m, colors: { label: ctx.accentText, value: palette.text },
      bullet: (cx, cy, r) => [shape(circlePath(cx, cy, r), { fill: ctx.accentText })],
    });
    return Math.max(afterDate.bottom, grid);
  }, bodyTop, limit, s);
  return { bodyBottom, limit };
}

const BUILDERS = { modern: buildModern, sporty: buildSporty, classic: buildClassic, background: buildBackground };

/**
 * @param options.measure (text, sizeMm, weight) => Breite in mm; ohne geladene Schriften eine Schätzung
 * @param options.logo natürliche Größe des Logos { width, height } oder null
 */
export function buildFlyerScene(tournament, config, language, t, { measure = approximateMeasure, logo = null, background = null, backgroundPanelTransparency = 50 } = {}) {
  const design = sanitizeFlyerConfig(config);
  const page = SIZES[design.format];
  const templateId = background ? 'background' : design.templateId;
  const palette = PALETTES[templateId];
  const accent = design.accentColor;
  const panelTransparency = Math.min(100, Math.max(0, Number(backgroundPanelTransparency) || 0));
  const ctx = {
    page, design, tournament, t, language, logo, palette, accent,
    backgroundPanelTransparency: panelTransparency,
    accentText: readableAccent(accent),
    m: metricsFor(page),
    ...collectContent(tournament, new Set(design.visibleFields), language, t),
  };
  const elements = [shape(rectPath(0, 0, page.width, page.height), { fill: palette.paper })];
  const { bodyBottom, limit } = BUILDERS[templateId](elements, measure, ctx);
  return { page, design: { ...design, templateId }, elements, overflow: bodyBottom > limit, bodyBottom, bodyLimit: limit };
}

/** Alle Zeichen, die gesetzt werden – zum Nachladen passender Teilschriften. */
export function flyerSceneText(scene) {
  return scene.elements.filter((element) => element.type === 'text').map((element) => element.text).join('');
}

export function flyerFileName(tournament, format, extension) {
  const slug = String(tournament.name || 'turnier').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'turnier';
  return `${slug}-${tournament.date || 'flyer'}-${format}.${extension}`;
}
