// Von Vite als eigene Assets ausgelieferte Schriftdateien (font-src 'self'); geladen werden sie erst im Flyer-Dialog.
// Schlüssel: <Teilschrift>-<Gewicht>-<Stil>, siehe FLYER_FONT_SUBSETS/FLYER_FONT_VARIANTS in flyer-fonts.js.
import latin400 from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff';
import latin700 from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff';
import latin400Italic from '@fontsource/noto-sans/files/noto-sans-latin-400-italic.woff';
import latin700Italic from '@fontsource/noto-sans/files/noto-sans-latin-700-italic.woff';
import latinExt400 from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff';
import latinExt700 from '@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff';
import latinExt400Italic from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-italic.woff';
import latinExt700Italic from '@fontsource/noto-sans/files/noto-sans-latin-ext-700-italic.woff';
import vietnamese400 from '@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff';
import vietnamese700 from '@fontsource/noto-sans/files/noto-sans-vietnamese-700-normal.woff';
import vietnamese400Italic from '@fontsource/noto-sans/files/noto-sans-vietnamese-400-italic.woff';
import vietnamese700Italic from '@fontsource/noto-sans/files/noto-sans-vietnamese-700-italic.woff';
import greek400 from '@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff';
import greek700 from '@fontsource/noto-sans/files/noto-sans-greek-700-normal.woff';
import greek400Italic from '@fontsource/noto-sans/files/noto-sans-greek-400-italic.woff';
import greek700Italic from '@fontsource/noto-sans/files/noto-sans-greek-700-italic.woff';
import greekExt400 from '@fontsource/noto-sans/files/noto-sans-greek-ext-400-normal.woff';
import greekExt700 from '@fontsource/noto-sans/files/noto-sans-greek-ext-700-normal.woff';
import greekExt400Italic from '@fontsource/noto-sans/files/noto-sans-greek-ext-400-italic.woff';
import greekExt700Italic from '@fontsource/noto-sans/files/noto-sans-greek-ext-700-italic.woff';
import cyrillic400 from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff';
import cyrillic700 from '@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff';
import cyrillic400Italic from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-italic.woff';
import cyrillic700Italic from '@fontsource/noto-sans/files/noto-sans-cyrillic-700-italic.woff';
import cyrillicExt400 from '@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff';
import cyrillicExt700 from '@fontsource/noto-sans/files/noto-sans-cyrillic-ext-700-normal.woff';
import cyrillicExt400Italic from '@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-italic.woff';
import cyrillicExt700Italic from '@fontsource/noto-sans/files/noto-sans-cyrillic-ext-700-italic.woff';

export const FLYER_FONT_URLS = {
  'latin-400-normal': latin400,
  'latin-700-normal': latin700,
  'latin-400-italic': latin400Italic,
  'latin-700-italic': latin700Italic,
  'latin-ext-400-normal': latinExt400,
  'latin-ext-700-normal': latinExt700,
  'latin-ext-400-italic': latinExt400Italic,
  'latin-ext-700-italic': latinExt700Italic,
  'vietnamese-400-normal': vietnamese400,
  'vietnamese-700-normal': vietnamese700,
  'vietnamese-400-italic': vietnamese400Italic,
  'vietnamese-700-italic': vietnamese700Italic,
  'greek-400-normal': greek400,
  'greek-700-normal': greek700,
  'greek-400-italic': greek400Italic,
  'greek-700-italic': greek700Italic,
  'greek-ext-400-normal': greekExt400,
  'greek-ext-700-normal': greekExt700,
  'greek-ext-400-italic': greekExt400Italic,
  'greek-ext-700-italic': greekExt700Italic,
  'cyrillic-400-normal': cyrillic400,
  'cyrillic-700-normal': cyrillic700,
  'cyrillic-400-italic': cyrillic400Italic,
  'cyrillic-700-italic': cyrillic700Italic,
  'cyrillic-ext-400-normal': cyrillicExt400,
  'cyrillic-ext-700-normal': cyrillicExt700,
  'cyrillic-ext-400-italic': cyrillicExt400Italic,
  'cyrillic-ext-700-italic': cyrillicExt700Italic,
};
