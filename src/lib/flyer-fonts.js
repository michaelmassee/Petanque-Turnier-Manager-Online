// Fontsource liefert die Unicode-Bereiche seiner Teilschriften als JSON mit; die package.json-exports geben die
// Datei nicht frei, daher der relative Pfad.
import fontsourceUnicode from '../../node_modules/@fontsource/noto-sans/unicode.json';

// Noto-Sans-Teilschriften in Fallback-Reihenfolge – dasselbe Prinzip wie die Font-Kandidaten im Hauptprojekt
// (HtmlZuPdfKonvertierer): satori nimmt für jedes Zeichen die erste übergebene Schrift mit passender Glyphe.
// Eine Fontsource-Datei deckt nur einen Unicode-Bereich ab (latin-ext enthält z. B. kein „A“).
export const FLYER_FONT_SUBSETS = ['latin', 'latin-ext', 'vietnamese', 'greek', 'greek-ext', 'cyrillic', 'cyrillic-ext'];
export const FLYER_FONT_VARIANTS = [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']];

/** Eigener Name je Teilschrift, damit satori sie als getrennte Fallback-Schriften behandelt. */
export function flyerFontFamily(subset) {
  return `Noto Sans ${subset}`;
}

// Unicode-Bereiche der Teilschriften ("U+0100-02BA,U+02BD-02C5,…") direkt aus Fontsource, statt sie abzuschreiben.
const UNICODE_RANGES = new Map(Object.entries(fontsourceUnicode).map(([subset, value]) => [
  subset,
  value.split(',').map((range) => {
    const [from, to = from] = range.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(from, 16), parseInt(to, 16)];
  }),
]));

/** Teilschriften, die die Zeichen von `text` abdecken (in Fallback-Reihenfolge). */
export function subsetsForText(text) {
  const needed = new Set();
  for (const char of String(text)) {
    const codePoint = char.codePointAt(0);
    const subset = FLYER_FONT_SUBSETS.find((name) => UNICODE_RANGES.get(name)?.some(([from, to]) => codePoint >= from && codePoint <= to));
    if (subset) needed.add(subset);
  }
  return FLYER_FONT_SUBSETS.filter((subset) => needed.has(subset));
}

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

/**
 * Lädt Teilschriften erst, wenn ein Text sie braucht, und hält die geladenen als satori-Fonts bereit.
 * @param loadBytes (subset, weight, style) => Promise<ArrayBuffer | Uint8Array>
 */
export function createFlyerFontRegistry(loadBytes) {
  const fonts = [];
  const pending = new Map();

  function load(subset) {
    if (!pending.has(subset)) {
      const promise = Promise.all(FLYER_FONT_VARIANTS.map(async ([weight, style]) => ({
        name: flyerFontFamily(subset), data: toArrayBuffer(await loadBytes(subset, weight, style)), weight, style,
      })));
      pending.set(subset, promise.then((loaded) => {
        fonts.push(...loaded);
        return loaded;
      }, (error) => {
        // Ein Netzfehler soll beim nächsten Versuch erneut laden dürfen.
        pending.delete(subset);
        throw error;
      }));
    }
    return pending.get(subset);
  }

  async function loadForText(text) {
    const lists = await Promise.all(subsetsForText(text).map(load));
    return lists.flat();
  }

  return { load, loadForText, fonts: () => [...fonts] };
}
