import satoriLayoutWasmUrl from 'satori/layout.wasm?url';
import { FLYER_FONT_URLS } from './flyer-font-urls.js';
import { createFlyerTypesetter } from './flyer-text.js';

// Modulweit, damit geladene Teilschriften und gesetzte Textblöcke beim nächsten Öffnen erhalten bleiben (Flyer und
// Ranglisten-PDF teilen sich die Instanz).
export const typesetFlyerText = createFlyerTypesetter(async (subset, weight, style) => {
  const key = `${subset}-${weight}-${style}`;
  const response = await fetch(FLYER_FONT_URLS[key]);
  if (!response.ok) throw new Error(`font ${key}: ${response.status}`);
  return response.arrayBuffer();
}, async () => {
  // Der Standard-Build von satori dekodiert sein eingebettetes WASM mit Node-Buffer; im Browser daher die
  // Standalone-Variante mit layout.wasm als eigenem Asset (script-src erlaubt dafür 'wasm-unsafe-eval').
  const [{ default: satori, init }, response] = await Promise.all([import('satori/standalone'), fetch(satoriLayoutWasmUrl)]);
  if (!response.ok) throw new Error(`satori layout.wasm: ${response.status}`);
  await init(await response.arrayBuffer());
  return satori;
});
