import { describe, expect, it } from 'vitest';
import { DEFAULT_QR_DESIGN, sanitizeQrDesign } from './qr-design.js';
import {
  composeQrSvg, contrastRatio, tintLogoPixels, footerSuggestions, headerSuggestions, hasWeakQrContrast, layoutQrImage, qrFileName, toQrOptions, wrapText,
} from './qr-style.js';

// Mess-Attrappe: jedes Zeichen ist 10 px breit.
const ctx = { font: '', measureText: (text) => ({ width: text.length * 10 }) };
const design = (changes = {}) => sanitizeQrDesign({ ...DEFAULT_QR_DESIGN, ...changes });

describe('QR-Code-Darstellung', () => {
  it('berechnet das WCAG-Kontrastverhältnis', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#1677ff', '#1677ff')).toBe(1);
  });

  it('warnt bei schwachem oder invertiertem Kontrast', () => {
    expect(hasWeakQrContrast(design())).toBe(false);
    expect(hasWeakQrContrast(design({ fgColor: '#dddddd' }))).toBe(true);
    expect(hasWeakQrContrast(design({ fgColor: '#ffffff', bgColor: '#000000' }))).toBe(true);
    expect(hasWeakQrContrast(design({ cornerColor: '#eeeeee' }))).toBe(true);
  });

  it('setzt hohe Fehlerkorrektur, Farben und Styles', () => {
    const options = toQrOptions(design({ fgColor: '#123456', cornerColor: '#aa0000', dotType: 'dots', cornerType: 'dot' }), 'https://ptm.test/x');

    expect(options).toMatchObject({
      data: 'https://ptm.test/x',
      qrOptions: { errorCorrectionLevel: 'H' },
      image: '/icons/logo.png',
      imageOptions: { hideBackgroundDots: true, saveAsBlob: true, imageSize: 0.3 },
      dotsOptions: { type: 'dots', color: '#123456' },
      cornersSquareOptions: { type: 'dot', color: '#aa0000' },
      cornersDotOptions: { type: 'dot', color: '#aa0000' },
      backgroundOptions: { color: '#ffffff' },
    });
  });

  it('enthält immer das Logo und nutzt ohne eigene Eckfarbe die Code-Farbe', () => {
    const options = toQrOptions(design(), 'https://ptm.test/x');

    expect(options.image).toBe('/icons/logo.png');
    expect(options.cornersSquareOptions.color).toBe('#000000');
    expect(options.cornersDotOptions.type).toBe('square');
  });

  it('bricht Text um und kürzt nach drei Zeilen', () => {
    expect(wrapText(ctx, 'aaa bbb ccc', 75)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapText(ctx, '', 75)).toEqual([]);
    const lines = wrapText(ctx, 'aaaa bbbb cccc dddd eeee', 45);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
  });

  it('plant Header und Footer nur ein, wenn Text vorhanden ist', () => {
    const ohne = layoutQrImage(ctx, design());
    const mit = layoutQrImage(ctx, design({ header: 'Jetzt anmelden', footer: 'BC Muster' }));

    expect(ohne.header).toEqual([]);
    expect(ohne.height).toBe(1024);
    expect(mit.header[0].text).toBe('Jetzt anmelden');
    expect(mit.qr.y).toBeGreaterThan(ohne.qr.y);
    expect(mit.height).toBeGreaterThan(ohne.height);
  });

  it('setzt das SVG mit escapten Texten zusammen', () => {
    const d = design({ header: '<Turnier> & "Spaß"' });
    const svg = composeQrSvg('<?xml version="1.0"?><svg width="864" height="864"></svg>', d, layoutQrImage(ctx, d));

    expect(svg).toContain('&lt;Turnier&gt; &amp; &quot;Spaß&quot;');
    expect(svg).not.toContain('<Turnier>');
    expect(svg.match(/<\?xml/g)).toHaveLength(1);
    expect(svg).toContain('<svg x="80" y="');
    expect(svg.match(/<text /g)).toHaveLength(1);
  });

  it('bildet einen sicheren Dateinamen', () => {
    expect(qrFileName('Pétanque-Cup 2026 / Herbst', 'png')).toBe('qr-petanque-cup-2026-herbst.png');
    expect(qrFileName('', 'svg', 'Tournament')).toBe('qr-tournament.svg');
    expect(qrFileName('🎉', 'png', 'Toernooi')).toBe('qr-toernooi.png');
    expect(qrFileName('', 'png')).toBe('qr.png');
  });

  it('bereinigt Designs aus unsicherer Quelle', () => {
    expect(sanitizeQrDesign(null)).toEqual(DEFAULT_QR_DESIGN);
    expect(sanitizeQrDesign({ fgColor: '#ABCDEF', textSize: 'xl' })).toMatchObject({ fgColor: '#abcdef', textSize: 'm' });
    // Früher gespeichertes showLogo wird ignoriert – das Logo ist immer enthalten.
    expect(sanitizeQrDesign({ showLogo: false })).not.toHaveProperty('showLogo');
  });

  it('schlägt Header-Texte aus Turniername und Datum vor, ohne Dubletten', () => {
    const texte = { callToAction: 'Jetzt anmelden!', prefix: 'Jetzt anmelden:', dateLabel: '4.10.2026' };

    expect(headerSuggestions({ name: 'Herbstturnier' }, texte)).toEqual([
      'Jetzt anmelden!', 'Herbstturnier', 'Jetzt anmelden: Herbstturnier', 'Herbstturnier · 4.10.2026',
    ]);
    expect(headerSuggestions({ name: 'Herbstturnier', club: 'BC Musterstadt' }, texte)).toEqual([
      'Jetzt anmelden!', 'Herbstturnier', 'Jetzt anmelden: Herbstturnier', 'Herbstturnier · 4.10.2026',
      'BC Musterstadt · Herbstturnier', 'Jetzt anmelden: BC Musterstadt',
    ]);
    expect(headerSuggestions({ name: '' }, texte)).toEqual(['Jetzt anmelden!']);
    expect(headerSuggestions({ name: 'Jetzt anmelden!' }, { ...texte, dateLabel: '' })).toEqual(['Jetzt anmelden!', 'Jetzt anmelden: Jetzt anmelden!']);
    expect(headerSuggestions({ name: 'x'.repeat(200) }, texte)[1]).toHaveLength(120);
  });

  it('schlägt Footer-Texte aus Verein und Turniername vor', () => {
    expect(footerSuggestions({ name: 'Herbstturnier', club: 'BC Musterstadt' }, { dateLabel: '4.10.2026' })).toEqual([
      'BC Musterstadt · Herbstturnier',
      'Herbstturnier · BC Musterstadt',
      'BC Musterstadt · Herbstturnier · 4.10.2026',
      'BC Musterstadt',
      'Herbstturnier',
      'Herbstturnier · 4.10.2026',
    ]);
    expect(footerSuggestions({ name: 'Herbstturnier', club: null })).toEqual(['Herbstturnier']);
  });



  it('übernimmt ein eingefärbtes Logo als data:-URL ohne Nachladen', () => {
    const options = toQrOptions(design(), 'https://ptm.test/x', { logoUrl: 'data:image/png;base64,abc' });

    expect(options.image).toBe('data:image/png;base64,abc');
    expect(options.imageOptions).toMatchObject({ hideBackgroundDots: true, saveAsBlob: false });
  });

  it('färbt das Logo zweifarbig: Dunkles/Farbiges in Code-Farbe, Helles in Hintergrundfarbe, Alpha bleibt', () => {
    const pixel = (r, g, b, a) => [r, g, b, a];
    const data = new Uint8ClampedArray([
      ...pixel(0, 0, 0, 255), // schwarz
      ...pixel(22, 119, 255, 255), // PTM-Blau
      ...pixel(255, 255, 255, 255), // weiße Podest-Zahl
      ...pixel(255, 255, 255, 0), // transparent
    ]);

    tintLogoPixels(data, '#0f6b3a', '#fff4e0');

    expect([...data.slice(0, 4)]).toEqual([15, 107, 58, 255]);
    expect([...data.slice(4, 8)]).toEqual([15, 107, 58, 255]);
    expect([...data.slice(8, 12)]).toEqual([255, 244, 224, 255]);
    expect(data[15]).toBe(0);
  });

  it('speichert die Option „Logo in Code-Farbe“ nur als echten Boolean', () => {
    expect(sanitizeQrDesign({ logoInCodeColor: true }).logoInCodeColor).toBe(true);
    expect(sanitizeQrDesign({ logoInCodeColor: 'ja' }).logoInCodeColor).toBe(false);
    expect(sanitizeQrDesign({}).logoInCodeColor).toBe(false);
  });
});

