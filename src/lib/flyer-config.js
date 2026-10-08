export const FLYER_TEMPLATES = ['modern', 'sporty', 'classic'];
export const FLYER_FORMATS = ['a4', 'a5'];
export const FLYER_VISIBLE_FIELDS = ['date', 'location', 'formation', 'fees', 'capacity', 'deadline', 'status'];

export const DEFAULT_FLYER_CONFIG = Object.freeze({
  schemaVersion: 1,
  templateId: 'modern',
  templateVersion: 1,
  format: 'a4',
  accentColor: '#1677ff',
  headline: '',
  subtitle: '',
  additionalText: '',
  visibleFields: FLYER_VISIBLE_FIELDS,
});

const COLOR = /^#[0-9a-f]{6}$/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function text(value, maxLength) {
  return String(value ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

// Wie text(), aber Absätze bleiben erhalten (höchstens eine Leerzeile am Stück).
function multilineText(value, maxLength) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeFlyerConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const visible = Array.isArray(source.visibleFields)
    ? [...new Set(source.visibleFields.filter((field) => FLYER_VISIBLE_FIELDS.includes(field)))]
    : DEFAULT_FLYER_CONFIG.visibleFields;
  return {
    schemaVersion: 1,
    templateId: FLYER_TEMPLATES.includes(source.templateId) ? source.templateId : DEFAULT_FLYER_CONFIG.templateId,
    templateVersion: 1,
    format: FLYER_FORMATS.includes(source.format) ? source.format : DEFAULT_FLYER_CONFIG.format,
    accentColor: COLOR.test(source.accentColor || '') ? source.accentColor.toLowerCase() : DEFAULT_FLYER_CONFIG.accentColor,
    headline: text(source.headline, 80),
    subtitle: text(source.subtitle, 120),
    additionalText: multilineText(source.additionalText, 600),
    visibleFields: visible,
  };
}
