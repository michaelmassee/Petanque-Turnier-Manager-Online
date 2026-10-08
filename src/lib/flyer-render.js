// Zeichnet eine Flyer-Scene (flyer-scene.js) als SVG bzw. PDF. Beide Ausgaben nutzen dieselben Elemente,
// dieselben Teilschriften (flyer-fonts.js) und dieselbe Aufteilung der Texte auf diese Schriften.
// Die erzeugten Dateien bleiben im Browser; gespeichert wird nur die Gestaltung.

const QR_QUIET_ZONE = 4;
const base64Cache = new WeakMap();

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function fontBase64(entry) {
  if (!base64Cache.has(entry)) base64Cache.set(entry, toBase64(entry.bytes));
  return base64Cache.get(entry);
}

function fontFamily(entry) {
  return `PTMFlyer-${entry.key}`;
}

function qrLayout(element, modules) {
  const cell = element.size / (modules.size + 2 * QR_QUIET_ZONE);
  const cells = [];
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column)) {
        cells.push({ x: element.x + (column + QR_QUIET_ZONE) * cell, y: element.y + (row + QR_QUIET_ZONE) * cell });
      }
    }
  }
  return { cell, cells };
}

/**
 * @param fontSet geladene Teilschriften; werden als Data-URL eingebettet, damit das SVG auch als <img>
 *   (Vorschau, PNG-Export) ohne externe Ressourcen genauso aussieht.
 * @param qrModules `QRCode.create(url).modules` aus dem Paket qrcode
 * @param logo { dataUrl } oder null
 */
export function renderFlyerSvg(scene, { fontSet, qrModules, logo }) {
  const usedFonts = new Set();
  const body = scene.elements.map((element) => {
    switch (element.type) {
      case 'rect':
        return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="${element.color}"/>`;
      case 'line':
        return `<line x1="${element.x1}" y1="${element.y1}" x2="${element.x2}" y2="${element.y2}" stroke="${element.color}" stroke-width="${element.width}"/>`;
      case 'image':
        return logo ? `<image href="${logo.dataUrl}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}"/>` : '';
      case 'qr': {
        const { cell, cells } = qrLayout(element, qrModules);
        const path = cells.map(({ x, y }) => `M${x} ${y}h${cell}v${cell}h${-cell}z`).join('');
        return `<rect x="${element.x}" y="${element.y}" width="${element.size}" height="${element.size}" fill="#ffffff"/><path d="${path}" fill="#000000" shape-rendering="crispEdges"/>`;
      }
      case 'text': {
        const spans = fontSet.runs(element.text, element.weight).map((run) => {
          usedFonts.add(run.entry);
          return `<tspan font-family="${fontFamily(run.entry)}">${escapeXml(run.text)}</tspan>`;
        }).join('');
        return `<text x="${element.x}" y="${element.y}" font-size="${element.size}" fill="${element.color}" xml:space="preserve">${spans}</text>`;
      }
      default:
        return '';
    }
  }).join('');
  const fontFaces = [...usedFonts]
    .map((entry) => `@font-face{font-family:"${fontFamily(entry)}";src:url(data:font/woff;base64,${fontBase64(entry)}) format("woff");}`)
    .join('');
  const { width, height } = scene.page;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`
    + `<style>${fontFaces}text{font-kerning:none;font-variant-ligatures:none;}</style>`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
}

function hexColor(rgb, value) {
  const clean = value.replace('#', '');
  return rgb(parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255);
}

/**
 * @param logo { png: Uint8Array } oder null – PDF kann nur PNG/JPEG einbetten, daher vorher normalisiert.
 * @returns PDF als Uint8Array
 */
export async function renderFlyerPdf(scene, { fontSet, qrModules, logo, title }) {
  const [{ PDFDocument, rgb }, fontkit] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit').then((module) => module.default),
  ]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  if (title) pdf.setTitle(title);
  const mm = 72 / 25.4;
  const pageHeight = scene.page.height;
  const page = pdf.addPage([scene.page.width * mm, pageHeight * mm]);
  const pdfFonts = new Map();

  async function pdfFont(entry) {
    // Fontsource liefert WOFF; nur das Subset-Embedding schreibt daraus ein gültiges TrueType ins PDF.
    if (!pdfFonts.has(entry.key)) pdfFonts.set(entry.key, await pdf.embedFont(entry.bytes, { subset: true }));
    return pdfFonts.get(entry.key);
  }

  for (const element of scene.elements) {
    if (element.type === 'rect') {
      page.drawRectangle({
        x: element.x * mm, y: (pageHeight - element.y - element.height) * mm,
        width: element.width * mm, height: element.height * mm, color: hexColor(rgb, element.color),
      });
    } else if (element.type === 'line') {
      page.drawLine({
        start: { x: element.x1 * mm, y: (pageHeight - element.y1) * mm },
        end: { x: element.x2 * mm, y: (pageHeight - element.y2) * mm },
        thickness: element.width * mm, color: hexColor(rgb, element.color),
      });
    } else if (element.type === 'image' && logo) {
      const image = await pdf.embedPng(logo.png);
      page.drawImage(image, {
        x: element.x * mm, y: (pageHeight - element.y - element.height) * mm, width: element.width * mm, height: element.height * mm,
      });
    } else if (element.type === 'qr') {
      const { cell, cells } = qrLayout(element, qrModules);
      page.drawRectangle({ x: element.x * mm, y: (pageHeight - element.y - element.size) * mm, width: element.size * mm, height: element.size * mm, color: rgb(1, 1, 1) });
      for (const { x, y } of cells) {
        page.drawRectangle({ x: x * mm, y: (pageHeight - y - cell) * mm, width: cell * mm, height: cell * mm, color: rgb(0, 0, 0) });
      }
    } else if (element.type === 'text') {
      let x = element.x;
      for (const run of fontSet.runs(element.text, element.weight)) {
        page.drawText(run.text, {
          x: x * mm, y: (pageHeight - element.y) * mm, size: element.size * mm,
          font: await pdfFont(run.entry), color: hexColor(rgb, element.color),
        });
        x += fontSet.runWidth(run, element.size);
      }
    }
  }
  return pdf.save();
}
