import { describe, expect, it } from 'vitest';
import { calendarEventLink } from './domain.js';

const turnier = { id: 't1', name: 'Herbstturnier', date: '2099-11-14', startTime: '10:00', timezone: 'Europe/Berlin',
  location: 'Teststraße 1, 35440 Linden' };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

describe('Kalendereintrag erstellen', () => {
  it('lädt am PC die ICS-Datei herunter', () => {
    expect(calendarEventLink(turnier, { userAgent: DESKTOP })).toEqual({
      href: '/api/tournaments/t1/calendar.ics?download=1', download: true, external: false,
    });
  });

  it('öffnet auf iPhone und iPad die ICS-Datei direkt im Kalender, mit Freigabelink', () => {
    expect(calendarEventLink(turnier, { userAgent: IPHONE, shareToken: 'abc' })).toEqual({
      href: '/api/tournaments/t1/calendar.ics?share=abc', download: false, external: false,
    });
    const iPadOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(calendarEventLink(turnier, { userAgent: iPadOs, maxTouchPoints: 5 }).download).toBe(false);
    expect(calendarEventLink(turnier, { userAgent: iPadOs, maxTouchPoints: 0 }).download).toBe(true);
  });

  it('öffnet auf Android Google Calendar mit Ortszeit und Link zum Turnier', () => {
    const link = calendarEventLink(turnier, { userAgent: ANDROID, origin: 'https://ptmonline.org' });
    const url = new URL(link.href);

    expect(link).toMatchObject({ download: false, external: true });
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'TEMPLATE', text: 'Herbstturnier', dates: '20991114T100000/20991114T140000', ctz: 'Europe/Berlin',
      location: 'Teststraße 1, 35440 Linden', details: 'https://ptmonline.org/turniere/t1/info',
    });
  });

  it('trägt Turniere ohne Startzeit auf Android ganztägig ein', () => {
    const link = calendarEventLink({ ...turnier, date: '2099-12-31', startTime: null }, { userAgent: ANDROID });
    const params = new URL(link.href).searchParams;

    expect(params.get('dates')).toBe('20991231/21000101');
    expect(params.has('ctz')).toBe(false);
  });
});
