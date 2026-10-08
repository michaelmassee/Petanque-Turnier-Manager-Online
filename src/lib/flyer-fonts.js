// Noto-Sans-Teilschriften in Fallback-Reihenfolge – dasselbe Prinzip wie die Font-Kandidaten im Hauptprojekt
// (HtmlZuPdfKonvertierer): Pro Zeichen gewinnt die erste Schrift, die eine Glyphe dafür hat. Eine einzelne
// Fontsource-Datei deckt nur einen Unicode-Bereich ab (latin-ext enthält z. B. kein „A“).
export const FLYER_FONT_SUBSETS = ['latin', 'latin-ext', 'vietnamese', 'greek', 'greek-ext', 'cyrillic', 'cyrillic-ext'];
export const FLYER_FONT_WEIGHTS = [400, 700];

function normalizeWeight(weight) {
  return weight >= 600 ? 700 : 400;
}

/** Grobe Breitenschätzung, solange noch keine Schrift geladen ist (Tests, erster Render). */
export function approximateMeasure(text, size, weight = 400) {
  return Array.from(String(text)).length * size * (normalizeWeight(weight) === 700 ? 0.62 : 0.56);
}

/**
 * @param entries geladene Schriften in Fallback-Reihenfolge: { subset, weight, key, bytes, font (fontkit) }
 */
export function createFlyerFontSet(entries) {
  const chains = new Map(FLYER_FONT_WEIGHTS.map((weight) => [weight, entries.filter((entry) => entry.weight === weight)]));

  function fontFor(codePoint, weight) {
    const chain = chains.get(normalizeWeight(weight));
    return chain.find((entry) => entry.font.hasGlyphForCodePoint(codePoint)) || chain[0];
  }

  /** Teilt einen Text in Abschnitte, die jeweils mit einer einzigen Schrift gesetzt werden. */
  function runs(text, weight = 400) {
    const result = [];
    for (const char of String(text)) {
      const entry = fontFor(char.codePointAt(0), weight);
      const last = result[result.length - 1];
      if (last && last.entry === entry) last.text += char;
      else result.push({ entry, text: char });
    }
    return result;
  }

  function runWidth(run, size) {
    const { font } = run.entry;
    return (font.layout(run.text).advanceWidth / font.unitsPerEm) * size;
  }

  function measure(text, size, weight = 400) {
    return runs(text, weight).reduce((sum, run) => sum + runWidth(run, size), 0);
  }

  function covers(codePoint) {
    return chains.get(400).some((entry) => entry.font.hasGlyphForCodePoint(codePoint));
  }

  return { entries, runs, runWidth, measure, covers };
}

/**
 * Lädt Teilschriften erst, wenn ein Text Zeichen enthält, die die bisher geladenen nicht abdecken.
 * @param loadBytes (subset, weight) => Promise<ArrayBuffer | Uint8Array>
 * @returns ensure(text) => Promise<FontSet>
 */
export function createFlyerFontLoader(loadBytes) {
  const loaded = [];
  let nextSubset = 0;
  let fontkitPromise = null;
  let queue = Promise.resolve();

  async function loadNextSubset() {
    const subset = FLYER_FONT_SUBSETS[nextSubset];
    fontkitPromise ||= import('@pdf-lib/fontkit').then((module) => module.default);
    const fontkit = await fontkitPromise;
    const entries = await Promise.all(FLYER_FONT_WEIGHTS.map(async (weight) => {
      const bytes = new Uint8Array(await loadBytes(subset, weight));
      return { subset, weight, key: `${subset}-${weight}`, bytes, font: fontkit.create(bytes) };
    }));
    // Erst nach erfolgreichem Laden weiterzählen, damit ein Netzfehler beim nächsten Versuch nachgeholt wird.
    loaded.push(...entries);
    nextSubset += 1;
  }

  async function ensure(text) {
    if (!nextSubset) await loadNextSubset();
    const codePoints = [...new Set(Array.from(String(text), (char) => char.codePointAt(0)))];
    let fontSet = createFlyerFontSet([...loaded]);
    while (nextSubset < FLYER_FONT_SUBSETS.length && codePoints.some((codePoint) => !fontSet.covers(codePoint))) {
      await loadNextSubset();
      fontSet = createFlyerFontSet([...loaded]);
    }
    return fontSet;
  }

  // Nacheinander abarbeiten, damit parallele Aufrufe keine Teilschrift doppelt laden.
  return (text) => {
    const result = queue.then(() => ensure(text));
    queue = result.catch(() => {});
    return result;
  };
}
