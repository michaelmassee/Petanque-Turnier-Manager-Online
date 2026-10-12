import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeRichText } from './lib/rich-text.js';
import worker, {
  LIVE_LINK_EMAILS, REGISTRATION_CONFIRMATION_EMAILS, REGISTRATION_DISPLACED_EMAILS,
  REGISTRATION_RECEIVED_EMAILS, TOURNAMENT_REMINDER_EMAILS,
  buildDirectionsLink, directionsEmailBlock, emailAction, renderTransactionalEmailHtml,
} from './worker.js';

const languages = ['de', 'nl', 'en', 'es', 'fr'];
const urls = {
  tournament: 'https://example.test/turniere/1/info',
  cancel: 'https://example.test/cancel/token?a=1&b=2',
  live: 'https://example.test/live/t/token',
  directions: buildDirectionsLink('Köln, Parkstraße 1'),
  whatsapp: 'https://chat.whatsapp.com/example',
};
const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const actionsFor = (language) => Object.entries(urls).map(([kind, url]) => emailAction(kind, url, language));
const cases = languages.flatMap((language) => [
  ['confirmation', REGISTRATION_CONFIRMATION_EMAILS[language].text('Michael', 'Herbstpokal', '12.10.2026', 'Köln', urls.tournament, urls.cancel, '', urls.live)],
  ['received', REGISTRATION_RECEIVED_EMAILS[language].text('Michael', 'Herbstpokal', urls.tournament, urls.cancel)],
  ['live', LIVE_LINK_EMAILS[language].text('Michael', 'Herbstpokal', urls.live)],
  ['reminder', TOURNAMENT_REMINDER_EMAILS[language].text('Michael', 'Herbstpokal', '12.10.2026', 'Köln', urls.tournament, urls.cancel)],
  ['waitlist', REGISTRATION_DISPLACED_EMAILS[language].textWaitlisted('Michael', 'Herbstpokal', urls.tournament, urls.cancel)],
  ['cancelled', REGISTRATION_DISPLACED_EMAILS[language].textCancelled('Michael', 'Herbstpokal', urls.tournament)],
].map(([kind, text]) => ({ language, kind, text })));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Layout der echten Mailvorlagen', () => {
  it.each(cases)('$kind ($language): zeigt Aktionsziele genau einmal als Button, nicht als URL', ({ language, text }) => {
    const actions = actionsFor(language);
    const document = parse(renderTransactionalEmailHtml('Herbstpokal', text
      + directionsEmailBlock({ location: 'Köln, Parkstraße 1' }, language)
      + `\n\nWhatsApp:\n${urls.whatsapp}`, language, null, '', actions));

    expect(document.documentElement.lang).toBe(language);
    expect(document.body.textContent).toContain('Michael');
    expect(document.body.textContent).not.toContain('https://');
    for (const action of actions) {
      const links = [...document.querySelectorAll('a')].filter((link) => link.getAttribute('href') === action.url);
      expect(links).toHaveLength(1);
      expect(links[0].textContent).toBe(action.icon + action.label);
      expect(links[0].style.display).toBe('inline-block');
    }
    for (const path of ['impressum', 'datenschutz']) {
      expect(document.querySelectorAll(`a[href="https://ptmonline.org/${path}"]`)).toHaveLength(1);
    }
  });

  it('erhält Begleittext und Rich Text, dedupliziert Aktionen vor und hinter der Nachrichtenbox', () => {
    const action = emailAction('tournament', urls.tournament, 'de');
    const richText = serializeRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bitte <pünktlich> sein.', marks: [{ type: 'bold' }] }] }] });
    const document = parse(renderTransactionalEmailHtml('Betreff', `Vorher:\r\n${action.url}\r\nWeiterer Text.`, 'de', richText,
      `Nachher:\n${action.url}\nEnde.`, [null, action, action]));

    expect([...document.querySelectorAll('a')].filter((link) => link.getAttribute('href') === action.url)).toHaveLength(1);
    expect(document.body.textContent).not.toContain(action.url);
    expect(document.body.textContent).toContain('Weiterer Text.');
    expect(document.body.textContent).toContain('Ende.');
    expect(document.querySelector('strong').textContent).toBe('Bitte <pünktlich> sein.');
  });

  it('verwechselt einen Trenner im Nachrichtentext nicht mit dem Produktfooter', () => {
    const document = parse(renderTransactionalEmailHtml('Betreff', 'Erster Teil\n\n----------\n\nLetzter Teil <script>nicht ausführen</script>', 'de'));
    expect(document.body.textContent).toContain('Erster Teil');
    expect(document.body.textContent).toContain('Letzter Teil <script>nicht ausführen</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelectorAll('a[href="https://ptmonline.org/datenschutz"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Entdecke Pétanqueturniere in deiner Nähe');
  });

  it.each(languages)('versendet neue Aktionen auch im Klartext-Fallback (%s)', async (language) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const tournamentAction = emailAction('tournament', urls.tournament, language);
    const directionAction = emailAction('directions', urls.directions, language);
    const ack = vi.fn();
    const retry = vi.fn();
    await worker.queue({ messages: [{ ack, retry, body: {
      to: 'recipient@example.test', subject: 'Herbstpokal', language,
      text: `Michael\n\n${tournamentAction.label}\n${tournamentAction.url}`,
      messageBox: 'Bitte pünktlich sein.',
      actions: [tournamentAction, directionAction, directionAction, null],
    } }] }, { RESEND_API_KEY: 'test-key', MAIL_FROM: 'mail@example.test' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    for (const action of [tournamentAction, directionAction]) {
      expect(sent.text.split(action.url)).toHaveLength(2);
      expect(sent.text).toContain(`${action.label}\n${action.url}`);
    }
    expect(sent.text).toContain('Bitte pünktlich sein.');
    expect(sent.text).toContain('https://ptmonline.org/impressum');
    expect(sent.text).toContain('https://ptmonline.org/datenschutz');
    expect(parse(sent.html).body.textContent).not.toContain('https://');
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
