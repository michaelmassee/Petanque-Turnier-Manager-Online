import { PX_PER_MM } from './flyer-text.js';

// Zeichnet eine Flyer-Scene (flyer-scene.js) als ein SVG. Vorschau und PNG nutzen es direkt, das PDF entsteht
// daraus mit svg2pdf.js. Texte hat satori bereits als Vektorpfade gesetzt, daher braucht weder das SVG noch das
// PDF Schriftdateien. Die erzeugten Dateien bleiben im Browser; gespeichert wird nur die Gestaltung.

// Ruhezone um den QR-Code (Anteil der Kantenlänge) – das Bild aus qr-code-styling hat keinen eigenen Rand.
const QR_MARGIN = 0.07;

function qrBox(element) {
  const inset = element.size * QR_MARGIN;
  return { x: element.x + inset, y: element.y + inset, size: element.size - 2 * inset };
}

function svgPath(element) {
  const attributes = [
    `d="${element.d}"`,
    `fill="${element.fill || 'none'}"`,
    element.stroke ? `stroke="${element.stroke}" stroke-width="${element.strokeWidth}"` : '',
    element.lineCap ? `stroke-linecap="${element.lineCap}"` : '',
    element.opacity !== undefined ? `opacity="${element.opacity}"` : '',
  ].filter(Boolean);
  return `<path ${attributes.join(' ')}/>`;
}

/**
 * @param qr gestalteter QR-Code (wie im QR-Dialog, mit PTM-Logo): { dataUrl, background }
 * @param logo { dataUrl } oder null
 * @param background lokales Hintergrundbild { dataUrl } oder null
 */
export function renderFlyerSvg(scene, { qr, logo, background = null }) {
  const body = scene.elements.map((element) => {
    switch (element.type) {
      case 'background':
        return background ? `<image href="${background.dataUrl}" x="0" y="0" width="${scene.page.width}" height="${scene.page.height}" preserveAspectRatio="xMidYMid slice"/>` : '';
      case 'path':
        return svgPath(element);
      case 'image':
        return logo ? `<image href="${logo.dataUrl}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"/>` : '';
      case 'qr': {
        const box = qrBox(element);
        return `<rect x="${element.x}" y="${element.y}" width="${element.size}" height="${element.size}" fill="${qr.background}"/>`
          + `<image href="${qr.dataUrl}" x="${box.x}" y="${box.y}" width="${box.size}" height="${box.size}"/>`;
      }
      case 'text':
        // satori setzt in px; der Block wird an seine Position geschoben und auf mm skaliert.
        return `<g transform="translate(${element.x} ${element.y}) scale(${1 / PX_PER_MM})">${element.markup}</g>`;
      default:
        return '';
    }
  }).join('');
  const { width, height } = scene.page;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
}

/**
 * Wandelt das Flyer-SVG mit jsPDF + svg2pdf.js in ein Vektor-PDF (nur im Browser: svg2pdf braucht ein echtes DOM).
 * @returns PDF als ArrayBuffer
 */
export async function renderFlyerPdf(svg, page, { title } = {}) {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const pdf = new jsPDF({ unit: 'mm', format: [page.width, page.height], orientation: 'portrait', compress: true });
  if (title) pdf.setProperties({ title });
  const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  // svg2pdf liest berechnete Styles; dafür muss das SVG kurz (unsichtbar) im Dokument hängen.
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '0';
  host.style.height = '0';
  host.style.overflow = 'hidden';
  host.append(document.importNode(element, true));
  document.body.append(host);
  try {
    await svg2pdf(host.firstElementChild, pdf, { x: 0, y: 0, width: page.width, height: page.height });
  } finally {
    host.remove();
  }
  return pdf.output('arraybuffer');
}
