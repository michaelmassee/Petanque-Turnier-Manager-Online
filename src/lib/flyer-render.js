// Zeichnet eine Flyer-Scene (flyer-scene.js) als SVG bzw. PDF. Beide Ausgaben nutzen dieselben Elemente,
// dieselben Teilschriften (flyer-fonts.js) und dieselbe Aufteilung der Texte auf diese Schriften.
// Die erzeugten Dateien bleiben im Browser; gespeichert wird nur die Gestaltung.

// Ruhezone um den QR-Code (Anteil der Kantenlänge) – das Bild aus qr-code-styling hat keinen eigenen Rand.
const QR_MARGIN = 0.07;
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
 * @param fontSet geladene Teilschriften; werden als Data-URL eingebettet, damit das SVG auch als <img>
 *   (Vorschau, PNG-Export) ohne externe Ressourcen genauso aussieht.
 * @param qr gestalteter QR-Code (wie im QR-Dialog, mit PTM-Logo): { dataUrl, png, background }
 * @param logo { dataUrl } oder null
 */
export function renderFlyerSvg(scene, { fontSet, qr, logo, background = null }) {
  const usedFonts = new Set();
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
      case 'text': {
        const spans = fontSet.runs(element.text, element.weight).map((run) => {
          usedFonts.add(run.entry);
          return `<tspan font-family="${fontFamily(run.entry)}">${escapeXml(run.text)}</tspan>`;
        }).join('');
        const opacity = element.opacity !== undefined ? ` fill-opacity="${element.opacity}"` : '';
        return `<text x="${element.x}" y="${element.y}" font-size="${element.size}" fill="${element.color}"${opacity} xml:space="preserve">${spans}</text>`;
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
export async function renderFlyerPdf(scene, { fontSet, qr, logo, background = null, title }) {
  const [{ LineCapStyle, PDFDocument, rgb }, fontkit] = await Promise.all([
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
    if (element.type === 'background' && background) {
      const image = background.type === 'image/jpeg' ? await pdf.embedJpg(background.bytes) : await pdf.embedPng(background.bytes);
      const scale = Math.max(scene.page.width / background.width, scene.page.height / background.height);
      const width = background.width * scale;
      const height = background.height * scale;
      page.drawImage(image, { x: (scene.page.width - width) * mm / 2, y: (scene.page.height - height) * mm / 2, width: width * mm, height: height * mm });
    } else if (element.type === 'path') {
      // Pfade sind in mm mit Ursprung oben links; drawSvgPath spiegelt die y-Achse selbst.
      page.drawSvgPath(element.d, {
        x: 0, y: pageHeight * mm, scale: mm,
        color: element.fill ? hexColor(rgb, element.fill) : undefined,
        borderColor: element.stroke ? hexColor(rgb, element.stroke) : undefined,
        borderWidth: element.stroke ? element.strokeWidth : undefined,
        borderLineCap: element.lineCap === 'round' ? LineCapStyle.Round : undefined,
        opacity: element.opacity, borderOpacity: element.opacity,
      });
    } else if (element.type === 'image' && logo) {
      const image = await pdf.embedPng(logo.png);
      page.drawImage(image, {
        x: element.x * mm, y: (pageHeight - element.y - element.height) * mm, width: element.width * mm, height: element.height * mm,
      });
    } else if (element.type === 'qr') {
      const box = qrBox(element);
      page.drawRectangle({ x: element.x * mm, y: (pageHeight - element.y - element.size) * mm, width: element.size * mm, height: element.size * mm, color: hexColor(rgb, qr.background) });
      page.drawImage(await pdf.embedPng(qr.png), { x: box.x * mm, y: (pageHeight - box.y - box.size) * mm, width: box.size * mm, height: box.size * mm });
    } else if (element.type === 'text') {
      let x = element.x;
      for (const run of fontSet.runs(element.text, element.weight)) {
        page.drawText(run.text, {
          x: x * mm, y: (pageHeight - element.y) * mm, size: element.size * mm,
          font: await pdfFont(run.entry), color: hexColor(rgb, element.color), opacity: element.opacity,
        });
        x += fontSet.runWidth(run, element.size);
      }
    }
  }
  return pdf.save();
}
