import { loadQrLogo, toQrOptions } from './qr-style.js';

// Bild-Helfer für QR-Codes (Verwalter-Dialog und QR-Panel der Turnierseite). qr-code-styling wird erst bei Bedarf geladen.
export function loadQrCodeStyling() {
  return import('qr-code-styling').then((module) => module.default);
}

export function saveBlob(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// Rendert den QR-Code (ohne Header/Footer) für design/url als Bitmap; Vorschau und Export nutzen dieselbe Funktion.
export async function createQrBitmap(design, url) {
  const QRCodeStyling = await loadQrCodeStyling();
  const logoUrl = await loadQrLogo(design);
  const blob = await new QRCodeStyling(toQrOptions(design, url, { logoUrl })).getRawData('png');
  return createImageBitmap(blob);
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/png');
  });
}

/**
 * Teilt ein PNG über das Teilen-Menü des Geräts; wo Dateien nicht geteilt werden können (viele Desktop-Browser), wird
 * das Bild in die Zwischenablage kopiert. Ergebnis: 'shared' | 'copied' | 'cancelled' | 'unsupported'; andere Fehler
 * werden weitergeworfen.
 */
export async function shareQrPng({ blob, fileName, title, text }) {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'copied';
  }
  return 'unsupported';
}
