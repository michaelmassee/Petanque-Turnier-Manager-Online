// Gemeinsames Schema des Anmelde-QR-Code-Designs (Frontend + Worker).
// Gespeichert wird es als JSON in tournaments.qr_design.

export const QR_DOT_TYPES = ['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'];
export const QR_CORNER_TYPES = ['square', 'extra-rounded', 'dot'];
export const QR_TEXT_SIZES = ['s', 'm', 'l'];
export const QR_TEXT_MAX_LENGTH = 120;

export const DEFAULT_QR_DESIGN = Object.freeze({
  fgColor: '#000000',
  bgColor: '#ffffff',
  // Leer = Eckmarken in der Vordergrundfarbe.
  cornerColor: '',
  dotType: 'square',
  cornerType: 'square',
  showLogo: true,
  header: '',
  footer: '',
  textSize: 'm',
});

const HEX_COLOR = /^#[0-9a-f]{6}$/;
// Steuerzeichen (inkl. Zeilenumbrüche) entfernen – Header/Footer sind einzeilige Eingaben.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function color(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function designText(value) {
  return String(value ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, QR_TEXT_MAX_LENGTH);
}

// Bereinigt ein beliebiges Objekt zu einem gültigen Design: nur bekannte Schlüssel,
// ungültige Werte fallen auf den Standard zurück.
export function sanitizeQrDesign(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    fgColor: color(input.fgColor, DEFAULT_QR_DESIGN.fgColor),
    bgColor: color(input.bgColor, DEFAULT_QR_DESIGN.bgColor),
    cornerColor: input.cornerColor ? color(input.cornerColor, '') : '',
    dotType: oneOf(input.dotType, QR_DOT_TYPES, DEFAULT_QR_DESIGN.dotType),
    cornerType: oneOf(input.cornerType, QR_CORNER_TYPES, DEFAULT_QR_DESIGN.cornerType),
    showLogo: input.showLogo === undefined ? DEFAULT_QR_DESIGN.showLogo : input.showLogo === true,
    header: designText(input.header),
    footer: designText(input.footer),
    textSize: oneOf(input.textSize, QR_TEXT_SIZES, DEFAULT_QR_DESIGN.textSize),
  };
}

export function parseStoredQrDesign(json) {
  if (!json) return null;
  try {
    return sanitizeQrDesign(JSON.parse(json));
  } catch {
    return null;
  }
}
