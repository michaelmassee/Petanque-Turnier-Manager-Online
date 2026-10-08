import { createFlyerFontRegistry, flyerFontFamily } from './flyer-fonts.js';
import { richTextDocument } from './rich-text.js';

// Flyer-Text wird mit satori gesetzt (Umbruch, Formatierungen, Schrift-Fallback) und als Vektorpfade ins
// Flyer-SVG übernommen. satori rechnet in px; 10 px je mm halten die auf ganze Pixel gerundeten Zeilenhöhen genau.
export const PX_PER_MM = 10;
const px = (mm) => Math.round(mm * PX_PER_MM * 100) / 100;

/** Element für satori (entspricht einem React-Element ohne React). */
export function el(type, style, children) {
  return { type, props: { style, children } };
}

/** Einfacher Textabsatz. */
export function textNode(text, { size, weight = 400, color, align = 'left', lineHeight = 1.25, opacity } = {}) {
  return el('div', {
    display: 'block', fontSize: px(size), fontWeight: weight, color, textAlign: align, lineHeight,
    ...(opacity !== undefined && opacity < 1 ? { opacity } : {}),
  }, String(text ?? ''));
}

/** Untereinander gestapelte Blöcke, optional mit Abstand (mm). */
export function stackNode(children, { gap = 0, align = 'left' } = {}) {
  return el('div', {
    display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'stretch', rowGap: px(gap),
  }, children.filter(Boolean));
}

// --- Rich Text: dieselben Knoten wie RichText.jsx (HTML-Anzeige), hier als satori-Elemente ---------------------

function inlineNode(node) {
  const marks = new Set((node.marks || []).map((mark) => mark.type));
  const decoration = [marks.has('underline') && 'underline', marks.has('strike') && 'line-through'].filter(Boolean).join(' ');
  return el('span', {
    ...(marks.has('bold') ? { fontWeight: 700 } : {}),
    ...(marks.has('italic') ? { fontStyle: 'italic' } : {}),
    ...(decoration ? { textDecoration: decoration } : {}),
  }, node.text);
}

function textblockNode(node, size, first) {
  const content = (node.content || []).filter((child) => child.text).map(inlineNode);
  const heading = node.type === 'heading';
  return el('div', {
    display: 'block',
    ...(heading ? { fontSize: px(size * 1.22), fontWeight: 700, marginTop: first ? 0 : px(size * 0.45) } : {}),
  }, content.length ? content : ' ');
}

function richBlockNodes(node, size, align, first) {
  if (node.type === 'paragraph' || node.type === 'heading') return [textblockNode(node, size, first)];
  const ordered = node.type === 'orderedList';
  const start = ordered ? node.attrs?.start || 1 : 1;
  // satori zeichnet keine Listenmarker – daher Marker und Inhalt als Zeile mit hängendem Einzug.
  const markerWidth = ordered ? size * (0.62 * String(start + node.content.length - 1).length + 0.9) : size * 1.3;
  return node.content.map((item, index) => el('div', {
    display: 'flex', flexDirection: 'row', justifyContent: align === 'center' ? 'center' : 'flex-start',
  }, [
    el('div', { display: 'block', width: px(markerWidth), flexShrink: 0 }, ordered ? `${start + index}.` : '•'),
    el('div', { display: 'flex', flexDirection: 'column', flexShrink: 1, minWidth: 0, textAlign: 'left' },
      item.content.flatMap((child, childIndex) => richBlockNodes(child, size, 'left', first && index === 0 && childIndex === 0))),
  ]));
}

/** Gespeicherter Rich Text (oder alter Klartext) als satori-Elemente. */
export function richTextNode(value, { size, color, align = 'left', lineHeight = 1.4 } = {}) {
  const blocks = richTextDocument(value).content.flatMap((node, index) => richBlockNodes(node, size, align, index === 0));
  return el('div', {
    display: 'flex', flexDirection: 'column', fontSize: px(size), color, lineHeight, textAlign: align,
  }, blocks);
}

// --- Setzen ---------------------------------------------------------------------------------------------------

let blockCounter = 0;

// satori vergibt in jedem SVG dieselben ids (Masken); im zusammengesetzten Flyer müssen sie eindeutig sein.
function uniqueIds(markup) {
  blockCounter += 1;
  const prefix = `fb${blockCounter}_`;
  return markup.replace(/id="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`);
}

/**
 * Liefert typeset(node, widthMm) => Promise<{ markup, width, height }> (Maße in mm, markup in px-Koordinaten).
 * Ergebnisse werden zwischengespeichert, weil die Vorschau bei jeder Eingabe neu gesetzt wird.
 * @param loadBytes (subset, weight, style) => Promise<ArrayBuffer | Uint8Array>
 * @param loadSatori () => Promise<satori> – im Browser `satori/standalone` mit eigenem layout.wasm, in Node der Standard-Build
 */
export function createFlyerTypesetter(loadBytes, loadSatori, { cacheSize = 400 } = {}) {
  const registry = createFlyerFontRegistry(loadBytes);
  const cache = new Map();
  let satoriPromise = null;

  async function render(node, widthMm) {
    satoriPromise ||= loadSatori().catch((error) => {
      satoriPromise = null;
      throw error;
    });
    const [satori] = await Promise.all([satoriPromise, registry.load('latin')]);
    const root = el('div', { display: 'flex', flexDirection: 'column', width: '100%', fontFamily: flyerFontFamily('latin') }, node);
    const svg = await satori(root, {
      width: Math.max(1, Math.round(widthMm * PX_PER_MM)),
      fonts: registry.fonts(),
      // Zeichen außerhalb der geladenen Teilschriften (z. B. Ł, Кириллица): passende Teilschrift nachladen.
      loadAdditionalAsset: async (_code, segment) => registry.loadForText(segment),
    });
    const match = svg.match(/^<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"[^>]*>([\s\S]*)<\/svg>$/);
    if (!match) throw new Error('satori-output');
    return { markup: uniqueIds(match[3]), width: Number(match[1]) / PX_PER_MM, height: Number(match[2]) / PX_PER_MM };
  }

  return function typeset(node, widthMm) {
    const key = `${widthMm.toFixed(2)}|${JSON.stringify(node)}`;
    if (!cache.has(key)) {
      cache.set(key, render(node, widthMm).catch((error) => {
        cache.delete(key);
        throw error;
      }));
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  };
}
