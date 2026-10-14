import { describe, expect, it } from 'vitest';
import { DEFAULT_FLYER_CONFIG, sanitizeFlyerConfig } from './flyer-config.js';

describe('flyer configuration', () => {
  it('keeps the background footer visible for older designs and accepts only an explicit hide option', () => {
    expect(sanitizeFlyerConfig({}).hideAdditionalText).toBe(false);
    expect(sanitizeFlyerConfig({ hideAdditionalText: 'true' }).hideAdditionalText).toBe(false);
    expect(sanitizeFlyerConfig({ hideAdditionalText: true }).hideAdditionalText).toBe(true);
  });

  it('loads the former background option and lets the new setting override it without deleting the text', () => {
    expect(sanitizeFlyerConfig({ backgroundHideFooter: true }).hideAdditionalText).toBe(true);
    const config = sanitizeFlyerConfig({ backgroundHideFooter: true, hideAdditionalText: false, additionalText: 'Kaffee und Kuchen.' });
    expect(config.hideAdditionalText).toBe(false);
    expect(config.additionalText).toBe('Kaffee und Kuchen.');
  });
  it('keeps only supported, bounded presentation values', () => {
    const config = sanitizeFlyerConfig({
      templateId: 'unknown', format: 'poster', accentColor: 'red', headline: `Titel${'x'.repeat(100)}`,
      visibleFields: ['date', 'date', 'unknown'], additionalText: 'A\nB', schemaVersion: 99,
    });
    expect(config.templateId).toBe(DEFAULT_FLYER_CONFIG.templateId);
    expect(config.format).toBe(DEFAULT_FLYER_CONFIG.format);
    expect(config.accentColor).toBe(DEFAULT_FLYER_CONFIG.accentColor);
    expect(config.headline).toHaveLength(80);
    expect(config.visibleFields).toEqual(['date']);
  });

  it('keeps paragraphs in the additional text but limits blank lines', () => {
    expect(sanitizeFlyerConfig({ additionalText: ' Zeile 1 \r\nZeile\t2\n\n\n\nAbsatz\u0007 ' }).additionalText)
      .toBe('Zeile 1\nZeile 2\n\nAbsatz');
  });
});
