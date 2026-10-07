// Darstellung des Anmelde-QR-Codes: Mapping des gespeicherten Designs (siehe qr-design.js) auf
// qr-code-styling und Zusammensetzen mit Header-/Footer-Text als PNG (Canvas) bzw. SVG.

export const QR_LOGO_URL = '/icons/logo.png';
export const QR_IMAGE_WIDTH = 1024;
const PADDING = 80;
const TEXT_GAP = 40;
const LINE_HEIGHT = 1.25;
const MAX_TEXT_LINES = 3;
const FONT_FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_SIZES = { s: 40, m: 56, l: 72 };

export const QR_COLOR_SWATCHES = ['#000000', '#172033', '#1677ff', '#0f6b3a', '#a61b1b', '#ffffff'];

export function qrCodeSize(width = QR_IMAGE_WIDTH) {
  return width - 2 * PADDING;
}

function hexToRgb(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

// Färbt RGBA-Pixel des Logos zweifarbig ein: dunkle/farbige Teile → Code-Farbe, helle (z. B. die weißen
// Podest-Zahlen) → Hintergrundfarbe. Transparenz bleibt erhalten. Ändert data in place.
export function tintLogoPixels(data, fgColor, bgColor) {
  const fg = hexToRgb(fgColor);
  const bg = hexToRgb(bgColor);
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const light = Math.min(1, Math.max(0, (luminance - 0.55) / 0.3));
    for (let channel = 0; channel < 3; channel += 1) {
      data[i + channel] = Math.round(fg[channel] + (bg[channel] - fg[channel]) * light);
    }
  }
  return data;
}

const tintedLogoCache = new Map();

// Liefert die Logo-URL für das Design: Original oder (Option „PTM-Logo in Code-Farbe“) eine eingefärbte data:-URL.
export function loadQrLogo(design) {
  if (!design.logoInCodeColor) return Promise.resolve(QR_LOGO_URL);
  const key = `${design.fgColor}/${design.bgColor}`;
  if (!tintedLogoCache.has(key)) {
    const promise = new Promise((resolve, reject) => {
      const logo = new Image();
      logo.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = logo.naturalWidth;
        canvas.height = logo.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(logo, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        tintLogoPixels(pixels.data, design.fgColor, design.bgColor);
        ctx.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      logo.onerror = () => reject(new Error('logo'));
      logo.src = QR_LOGO_URL;
    });
    promise.catch(() => tintedLogoCache.delete(key));
    tintedLogoCache.set(key, promise);
  }
  return tintedLogoCache.get(key);
}

export function toQrOptions(design, url, { type = 'canvas', size = qrCodeSize(), logoUrl = QR_LOGO_URL } = {}) {
  const cornerColor = design.cornerColor || design.fgColor;
  return {
    type,
    width: size,
    height: size,
    margin: 0,
    data: url,
    qrOptions: { errorCorrectionLevel: 'H' },
    // Das PTM-Logo ist immer enthalten. Ein eingefärbtes Logo ist bereits eine data:-URL: dann kein
    // Nachladen per XHR (saveAsBlob), das scheitert an der CSP (connect-src 'self') und lässt das Rendern hängen.
    image: logoUrl,
    imageOptions: { hideBackgroundDots: true, saveAsBlob: !logoUrl.startsWith('data:'), imageSize: 0.3, margin: 8, crossOrigin: 'anonymous' },
    dotsOptions: { type: design.dotType, color: design.fgColor },
    cornersSquareOptions: { type: design.cornerType, color: cornerColor },
    cornersDotOptions: { type: design.cornerType === 'square' ? 'square' : 'dot', color: cornerColor },
    backgroundOptions: { color: design.bgColor },
  };
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG-Kontrastverhältnis zweier #rrggbb-Farben (1 … 21).
export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Scanner brauchen deutlichen Kontrast und dunkle Module auf hellem Grund.
export function hasWeakQrContrast(design) {
  const colors = [design.fgColor, design.cornerColor || design.fgColor];
  return colors.some((color) => contrastRatio(color, design.bgColor) < 4 || relativeLuminance(color) > relativeLuminance(design.bgColor));
}

function textFont(design, weight) {
  return `${weight} ${FONT_SIZES[design.textSize] || FONT_SIZES.m}px ${FONT_FAMILY}`;
}

// Bricht Text wortweise auf maxWidth um; zu lange Texte werden nach MAX_TEXT_LINES Zeilen mit „…“ gekürzt.
export function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= MAX_TEXT_LINES) return lines;
  const kept = lines.slice(0, MAX_TEXT_LINES);
  let last = kept[MAX_TEXT_LINES - 1];
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[MAX_TEXT_LINES - 1] = `${last.trimEnd()}…`;
  return kept;
}

// Berechnet Zeilen und Positionen für Header, QR-Code und Footer. ctx dient nur zum Messen der Texte.
export function layoutQrImage(ctx, design, width = QR_IMAGE_WIDTH) {
  const fontSize = FONT_SIZES[design.textSize] || FONT_SIZES.m;
  const lineHeight = Math.round(fontSize * LINE_HEIGHT);
  const textWidth = width - 2 * PADDING;
  ctx.font = textFont(design, 700);
  const headerLines = wrapText(ctx, design.header, textWidth);
  ctx.font = textFont(design, 500);
  const footerLines = wrapText(ctx, design.footer, textWidth);

  let y = PADDING;
  const header = headerLines.map((line, index) => ({ text: line, y: y + index * lineHeight + fontSize }));
  if (headerLines.length) y += headerLines.length * lineHeight + TEXT_GAP;
  const qr = { x: PADDING, y, size: qrCodeSize(width) };
  y += qr.size;
  if (footerLines.length) y += TEXT_GAP;
  const footer = footerLines.map((line, index) => ({ text: line, y: y + index * lineHeight + fontSize }));
  y += footerLines.length * lineHeight + PADDING;
  return { width, height: y, qr, header, footer };
}

export function drawQrImage(canvas, qrImage, design) {
  const ctx = canvas.getContext('2d');
  const layout = layoutQrImage(ctx, design);
  canvas.width = layout.width;
  canvas.height = layout.height;
  ctx.fillStyle = design.bgColor;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.drawImage(qrImage, layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size);
  ctx.fillStyle = design.fgColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const [lines, weight] of [[layout.header, 700], [layout.footer, 500]]) {
    ctx.font = textFont(design, weight);
    for (const line of lines) ctx.fillText(line.text, layout.width / 2, line.y);
  }
  return layout;
}

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

// Bettet das SVG von qr-code-styling als verschachteltes <svg> ein und ergänzt Header/Footer als <text>.
export function composeQrSvg(qrSvgText, design, layout) {
  const fontSize = FONT_SIZES[design.textSize] || FONT_SIZES.m;
  const inner = String(qrSvgText)
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg\b/, `<svg x="${layout.qr.x}" y="${layout.qr.y}"`);
  const text = (lines, weight) => lines
    .map((line) => `<text x="${layout.width / 2}" y="${line.y}" text-anchor="middle" font-family="${escapeXml(FONT_FAMILY)}" font-size="${fontSize}" font-weight="${weight}" fill="${design.fgColor}">${escapeXml(line.text)}</text>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`
    + `<rect width="100%" height="100%" fill="${design.bgColor}"/>${text(layout.header, 700)}${inner}${text(layout.footer, 500)}</svg>`;
}

function fileSlug(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Dateiname für den Download; fallback ist der übersetzte Ersatzname, wenn der Turniername nichts Verwertbares hergibt.
export function qrFileName(tournamentName, extension, fallback = '') {
  const slug = fileSlug(tournamentName) || fileSlug(fallback);
  return slug ? `qr-${slug}.${extension}` : `qr.${extension}`;
}

function uniqueSuggestions(candidates, maxLength) {
  return [...new Set(candidates.map((text) => String(text || '').trim()).filter(Boolean))]
    .map((text) => text.slice(0, maxLength));
}

// Vorschläge für den Header-Text aus Turniername, Verein und Datum; Bausteine kommen übersetzt herein.
export function headerSuggestions(tournament, { callToAction, prefix, dateLabel = '' }, maxLength = 120) {
  const name = String(tournament?.name || '').trim();
  const club = String(tournament?.club || '').trim();
  return uniqueSuggestions([
    callToAction,
    name,
    name && `${prefix} ${name}`,
    name && dateLabel && `${name} · ${dateLabel}`,
    club && name && `${club} · ${name}`,
    club && `${prefix} ${club}`,
  ], maxLength);
}

// Vorschläge für den Footer-Text aus Verein und Turniername (ohne Verein nur das Turnier).
export function footerSuggestions(tournament, { dateLabel = '' } = {}, maxLength = 120) {
  const name = String(tournament?.name || '').trim();
  const club = String(tournament?.club || '').trim();
  return uniqueSuggestions([
    club && name && `${club} · ${name}`,
    club && name && `${name} · ${club}`,
    club && name && dateLabel && `${club} · ${name} · ${dateLabel}`,
    club,
    name,
    name && dateLabel && `${name} · ${dateLabel}`,
  ], maxLength);
}

