import { fileNameSlug } from './flyer-scene.js';
import { PX_PER_MM, el, stackNode, textNode } from './flyer-text.js';
import { rankingColumnKeys, rankingHeaderGroups, rankingValue } from './live-ranking.js';

// Endrangliste als A4-PDF: Texte setzt satori wie beim Flyer als Vektorpfade (alle Noto-Sans-Teilschriften, also auch
// Ł, Кириллица …), das PDF entsteht mit svg2pdf im Browser. Kein Serveraufwand, keine eingebetteten Schriftdateien.

export const RANKING_PAGE = { width: 210, height: 297 };
const MARGIN = 15;
const LOGO_BOX = 24;
const BRAND = '#086f61';
const TEXT = '#1f2a28';
const MUTED = '#5b6b68';
const STRIPE = '#eef5f4';
const FONT = 3.1;
const NUMBER_COLUMN = 15;
const RANK_COLUMN = 11;
const FOOTER_HEIGHT = 8;

const px = (mm) => Math.round(mm * PX_PER_MM * 100) / 100;
const n = (value) => Math.round(value * 100) / 100;

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' };

function cell(text, { width, grow = false, align = 'left', weight = 400, color = TEXT }) {
  return el('div', {
    display: 'flex', alignItems: 'center', justifyContent: JUSTIFY[align],
    ...(grow ? { flexGrow: 1, flexShrink: 1, flexBasis: 0 } : { width: px(width), flexShrink: 0 }),
    paddingLeft: px(1.2), paddingRight: px(1.2),
  }, [textNode(text, { size: FONT, weight, color, align })]);
}

function tableRow(cells, { background } = {}) {
  return el('div', {
    display: 'flex', flexDirection: 'row', alignItems: 'center', paddingTop: px(1.3), paddingBottom: px(1.3),
    ...(background ? { backgroundColor: background } : {}),
  }, cells);
}

const columnWidth = (key) => (key === 'rank' ? RANK_COLUMN : NUMBER_COLUMN);

function columnCell(key, value, options = {}) {
  if (key === 'label') return cell(value, { grow: true, ...options });
  return cell(value, { width: columnWidth(key), align: key === 'rank' ? 'left' : 'right', ...options });
}

function headerNode(groups) {
  const headerCell = (key, text, align) => columnCell(key, text, { weight: 700, color: BRAND, ...(align ? { align } : {}) });
  return el('div', {
    display: 'flex', flexDirection: 'row', alignItems: 'stretch', paddingTop: px(1.3), paddingBottom: px(1.3),
    borderBottom: `${px(0.4)}px solid ${BRAND}`,
  }, groups.map((group) => {
    if (!group.subLabels) return headerCell(group.keys[0], group.label);
    const width = group.keys.reduce((sum, key) => sum + columnWidth(key), 0);
    return el('div', { display: 'flex', flexDirection: 'column', width: px(width), flexShrink: 0 }, [
      el('div', { display: 'flex', justifyContent: 'center', marginLeft: px(1.2), marginRight: px(1.2), paddingBottom: px(0.5), borderBottom: `${px(0.2)}px solid ${BRAND}` }, [
        textNode(group.label, { size: FONT, weight: 700, color: BRAND, align: 'center' }),
      ]),
      el('div', { display: 'flex', flexDirection: 'row', paddingTop: px(0.5) }, group.keys.map((key, index) => headerCell(key, group.subLabels[index]))),
    ]);
  }));
}

function tableNode(columns, groups, entries, firstIndex) {
  return stackNode([
    headerNode(groups),
    ...entries.map((entry, offset) => tableRow(
      columns.map((key) => columnCell(key, rankingValue(key, entry[key]))),
      { background: (firstIndex + offset) % 2 === 1 ? STRIPE : null },
    )),
  ]);
}

function fitLogo(logo, x, y) {
  if (!logo) return null;
  const scale = Math.min(LOGO_BOX / logo.width, LOGO_BOX / logo.height);
  const width = logo.width * scale;
  const height = logo.height * scale;
  return { type: 'image', dataUrl: logo.dataUrl, x: n(x + (LOGO_BOX - width) / 2), y: n(y + (LOGO_BOX - height) / 2), width: n(width), height: n(height) };
}

/**
 * Seiten der Endrangliste (Maße in mm). Jede Seite trägt Kopf mit Vereins- und PTM-Logo, Tabelle und Fußzeile.
 * @param entries normalisierte Einträge (normalizeRanking)
 * @param header { title, name, lines: string[] } – fertig formatierte Kopfzeilen
 * @param logos { club, ptm } jeweils { dataUrl, width, height } oder null
 * @param footer (page, pages) => string
 */
export async function buildRankingPages({ tournament, entries, header, logos, footer, t, typeset }) {
  const contentWidth = RANKING_PAGE.width - 2 * MARGIN;
  const headerWidth = contentWidth - 2 * (LOGO_BOX + 4);
  const headerBlock = await typeset(stackNode([
    textNode(header.title, { size: 3.6, weight: 700, color: BRAND, align: 'center' }),
    textNode(header.name, { size: 6, weight: 700, color: TEXT, align: 'center' }),
    ...header.lines.filter(Boolean).map((line) => textNode(line, { size: 3.2, color: MUTED, align: 'center' })),
  ], { gap: 1.2, align: 'center' }), headerWidth);
  const tableTop = MARGIN + Math.max(LOGO_BOX, headerBlock.height) + 7;
  const available = RANKING_PAGE.height - MARGIN - FOOTER_HEIGHT - tableTop;

  const columns = rankingColumnKeys(tournament, entries);
  const groups = rankingHeaderGroups(columns, tournament, t);
  const chunks = [];
  let start = 0;
  // Zeilen je Seite: so viele wie passen; umbrechende Namen machen Zeilen höher, daher nachmessen.
  do {
    let count = Math.min(entries.length - start, 45);
    let block = await typeset(tableNode(columns, groups, entries.slice(start, start + count), start), contentWidth);
    while (block.height > available && count > 1) {
      count = Math.max(1, Math.min(count - 1, Math.floor(count * available / block.height)));
      block = await typeset(tableNode(columns, groups, entries.slice(start, start + count), start), contentWidth);
    }
    chunks.push(block);
    start += count;
  } while (start < entries.length);

  return Promise.all(chunks.map(async (block, index) => {
    const footerBlock = await typeset(textNode(footer(index + 1, chunks.length), { size: 2.6, color: MUTED, align: 'center' }), contentWidth);
    return {
      page: RANKING_PAGE,
      elements: [
        fitLogo(logos.club, MARGIN, MARGIN),
        fitLogo(logos.ptm, RANKING_PAGE.width - MARGIN - LOGO_BOX, MARGIN),
        { type: 'text', x: MARGIN + LOGO_BOX + 4, y: MARGIN, ...headerBlock },
        { type: 'line', x1: MARGIN, x2: RANKING_PAGE.width - MARGIN, y: n(tableTop - 3) },
        { type: 'text', x: MARGIN, y: tableTop, ...block },
        { type: 'text', x: MARGIN, y: n(RANKING_PAGE.height - MARGIN - footerBlock.height), ...footerBlock },
      ].filter(Boolean),
    };
  }));
}

export function renderRankingSvg({ page, elements }) {
  const body = elements.map((element) => {
    switch (element.type) {
      case 'image':
        return `<image href="${element.dataUrl}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"/>`;
      case 'line':
        return `<line x1="${element.x1}" y1="${element.y}" x2="${element.x2}" y2="${element.y}" stroke="${BRAND}" stroke-width="0.5"/>`;
      case 'text':
        return `<g transform="translate(${element.x} ${element.y}) scale(${1 / PX_PER_MM})">${element.markup}</g>`;
      default:
        return '';
    }
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">`
    + `<rect width="${page.width}" height="${page.height}" fill="#ffffff"/>${body}</svg>`;
}

export function rankingFileName(tournament) {
  return `rangliste-${fileNameSlug(tournament.name)}.pdf`;
}
