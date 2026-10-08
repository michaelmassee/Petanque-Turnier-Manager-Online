import { formatDate, formatMoney, formatTournamentDateTime } from './format.js';
import { formationLabel, labelFor, registrationStatusLabel } from './domain.js';
import { REGISTRATION_TYPES, TOURNAMENT_TYPES } from './constants.js';
import { FLYER_TEMPLATE_STYLES, sanitizeFlyerConfig } from './flyer-config.js';
import { approximateMeasure } from './flyer-fonts.js';

// Alle Maße in mm. Die Scene ist das einzige Layout: SVG-Vorschau, PNG und PDF zeichnen nur ihre Elemente.
const SIZES = { a4: { width: 210, height: 297 }, a5: { width: 148, height: 210 } };
const FORMAT_LAYOUT = {
  a4: { titleSize: 10, logoHeight: 18, logoMaxWidth: 40, qrSize: 50 },
  a5: { titleSize: 8, logoHeight: 14, logoMaxWidth: 30, qrSize: 39 },
};
const MARGIN = 12;
const ACCENT_BAR_HEIGHT = 8;
const MUTED_COLOR = '#465366';
const SUBTITLE = { size: 4.3, lineHeight: 6 };
const LABEL = { size: 3, lineHeight: 4.5 };
const VALUE = { size: 4.3, lineHeight: 5.6 };
const NOTE = { size: 3.6, lineHeight: 5 };
// Anteil der Schriftgröße über bzw. unter der Grundlinie (Noto Sans).
const ASCENT = 0.8;
const DESCENT = 0.25;

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

function feeLines(tournament, language) {
  const tiers = (tournament.feeTiers || []).filter((tier) => tier.active !== false);
  if (tiers.length) return tiers.map((tier) => `${tier.name}: ${formatMoney(tier.amountCents, tournament.currency, language)}`);
  if (Number(tournament.entryFeeCents || 0) > 0) return [formatMoney(tournament.entryFeeCents, tournament.currency, language)];
  return [];
}

function collectFacts(tournament, visible, language, t) {
  const facts = [];
  if (visible.has('date')) facts.push({ label: t('Datum'), values: [formatDate(tournament.date, language), tournament.startTime || ''] });
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
  return facts.map((fact) => ({ ...fact, values: fact.values.filter(Boolean) })).filter((fact) => fact.values.length);
}

/**
 * @param options.measure (text, sizeMm, weight) => Breite in mm; ohne geladene Schriften eine Schätzung
 * @param options.logo natürliche Größe des Logos { width, height } oder null
 */
export function buildFlyerScene(tournament, config, language, t, { measure = approximateMeasure, logo = null } = {}) {
  const design = sanitizeFlyerConfig(config);
  const page = SIZES[design.format];
  const layout = FORMAT_LAYOUT[design.format];
  const textColor = FLYER_TEMPLATE_STYLES[design.templateId].textColor;
  const accent = design.accentColor;
  const contentWidth = page.width - 2 * MARGIN;
  const elements = [{ type: 'rect', x: 0, y: 0, width: page.width, height: ACCENT_BAR_HEIGHT, color: accent }];
  let top = ACCENT_BAR_HEIGHT + 6;
  let contentBottom = top;

  function addLines(lines, { x = MARGIN, size, lineHeight, weight = 400, color = textColor }) {
    for (const line of lines) {
      const baseline = top + size * ASCENT;
      if (line) {
        elements.push({ type: 'text', x, y: baseline, size, weight, color, text: line });
        contentBottom = baseline + size * DESCENT;
      }
      top += lineHeight;
    }
  }

  if (logo?.width > 0 && logo?.height > 0) {
    const scale = Math.min(layout.logoMaxWidth / logo.width, layout.logoHeight / logo.height);
    elements.push({ type: 'image', x: MARGIN, y: top, width: logo.width * scale, height: logo.height * scale });
    top += logo.height * scale + 5;
    contentBottom = top;
  }

  const titleSize = layout.titleSize;
  addLines(wrapText(design.headline || tournament.name, contentWidth, titleSize, 700, measure), { size: titleSize, lineHeight: titleSize * 1.2, weight: 700 });
  top += 2;
  addLines(wrapText(design.subtitle, contentWidth, SUBTITLE.size, 400, measure), { ...SUBTITLE, color: MUTED_COLOR });
  top += 5;
  for (const fact of collectFacts(tournament, new Set(design.visibleFields), language, t)) {
    addLines([fact.label.toUpperCase()], { ...LABEL, weight: 700, color: accent });
    addLines(fact.values.flatMap((value) => wrapText(value, contentWidth, VALUE.size, 400, measure)), VALUE);
    top += 3;
  }

  // Fußbereich: QR-Code unten rechts, Zusatztext links daneben, darüber eine Trennlinie.
  const qrSize = layout.qrSize;
  const qrX = page.width - MARGIN - qrSize;
  const noteWidth = qrX - MARGIN - 6;
  const noteLines = design.additionalText
    .split('\n')
    .flatMap((paragraph) => (paragraph ? wrapText(paragraph, noteWidth, NOTE.size, 400, measure) : ['']));
  const footerTop = page.height - MARGIN - Math.max(qrSize, noteLines.length * NOTE.lineHeight);
  const separatorY = footerTop - 5;
  const overflow = contentBottom > separatorY - 4;

  elements.push({ type: 'line', x1: MARGIN, y1: separatorY, x2: page.width - MARGIN, y2: separatorY, width: 0.7, color: accent });
  top = footerTop;
  addLines(noteLines, { ...NOTE, color: MUTED_COLOR });
  elements.push({ type: 'qr', x: qrX, y: page.height - MARGIN - qrSize, size: qrSize });

  return { page, design, elements, overflow };
}

/** Alle Zeichen, die gesetzt werden – zum Nachladen passender Teilschriften. */
export function flyerSceneText(scene) {
  return scene.elements.filter((element) => element.type === 'text').map((element) => element.text).join('');
}

export function flyerFileName(tournament, format, extension) {
  const slug = String(tournament.name || 'turnier').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'turnier';
  return `${slug}-${tournament.date || 'flyer'}-${format}.${extension}`;
}
