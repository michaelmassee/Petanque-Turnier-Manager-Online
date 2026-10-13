// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import worker, {
  REGISTRATION_CONFIRMATION_EMAILS, REGISTRATION_RECEIVED_EMAILS,
  REGISTRATION_DISPLACED_EMAILS, TOURNAMENT_REMINDER_EMAILS, LIVE_LINK_EMAILS,
  appendEmailFooter, buildDirectionsLink, buildTournamentContactLink, directionsEmailBlock, emailAction, renderTransactionalEmailHtml,
} from './worker.js';

const urls = {
  tournament: 'https://example.test/turniere/t1/info',
  live: 'https://example.test/live/t/review-token',
  cancel: 'https://example.test/abmelden?token=review-token&next=t1',
  directions: buildDirectionsLink('Parkweg 1, Linden (Innenhof)'),
  whatsapp: 'https://chat.whatsapp.com/review-group',
};
const messageLinks = (document, url) => [...document.querySelectorAll('a')].filter((link) => link.getAttribute('href') === url);

const templates = [
  ['Bestätigung', (language) => REGISTRATION_CONFIRMATION_EMAILS[language].text('Lea', 'Testturnier', '01.11.2026', 'Parkweg 1', urls.tournament, urls.cancel, '', urls.live), ['tournament', 'cancel', 'live']],
  ['Anmeldungseingang', (language) => REGISTRATION_RECEIVED_EMAILS[language].text('Lea', 'Testturnier', urls.tournament, urls.cancel), ['tournament', 'cancel']],
  ['Erinnerung', (language) => TOURNAMENT_REMINDER_EMAILS[language].text('Lea', 'Testturnier', '01.11.2026', 'Parkweg 1', urls.tournament, urls.cancel), ['tournament', 'cancel']],
  ['Warteliste', (language) => REGISTRATION_DISPLACED_EMAILS[language].textWaitlisted('Lea', 'Testturnier', urls.tournament, urls.cancel), ['tournament', 'cancel']],
  ['Live-Link', (language) => LIVE_LINK_EMAILS[language].text('Lea', 'Testturnier', urls.live), ['live']],
];

describe.each(['de', 'nl', 'en', 'es', 'fr'])('Aktionsbuttons in echten Mailvorlagen (%s)', (language) => {
  it.each(templates)('%s enthält jeden Aktionslink genau einmal als lokalisierten Button', (_name, buildText, kinds) => {
    const text = buildText(language) + directionsEmailBlock({ location: 'Parkweg 1, Linden (Innenhof)' }, language);
    const actions = [...kinds, 'directions'].map((kind) => emailAction(kind, urls[kind], language));
    const dom = new JSDOM(renderTransactionalEmailHtml('Testturnier', text, language, null, '', actions));
    try {
      const document = dom.window.document;
      for (const action of actions) {
        const links = messageLinks(document, action.url);
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe(action.icon + action.label);
        expect(document.body.textContent).not.toContain(action.url);
        expect(appendEmailFooter(text, language)).toContain(action.url);
      }
      expect(document.body.textContent).toContain('Lea');
      expect(document.body.textContent).toContain('Testturnier');
    } finally {
      dom.window.close();
    }
  });
});

describe('Nachricht an die Turnierleitung', () => {
  const tournament = {
    id: 't1', name: 'Herbstturnier & Mêlée', date: '2099-09-28', start_time: '10:30',
    timezone: 'Europe/Berlin', location: 'Parkweg 1, Linden', contact_email: 'kontakt+turnier@example.test',
  };

  it.each([
    ['de', 'Nachricht an Turnierleitung', 'Meine Nachricht:'],
    ['nl', 'Bericht aan de toernooiorganisatie', 'Mijn bericht:'],
    ['en', 'Message the tournament organizers', 'My message:'],
    ['es', 'Mensaje a la organización del torneo', 'Mi mensaje:'],
    ['fr', 'Contacter l’organisation du tournoi', 'Mon message :'],
  ])('öffnet einen vorbefüllten, lokalisierten Entwurf (%s)', (language, label, messageLabel) => {
    const href = buildTournamentContactLink(tournament, 'https://ptm.test', language);
    const parsed = new URL(href);
    expect(parsed.protocol).toBe('mailto:');
    expect(decodeURIComponent(parsed.pathname)).toBe('kontakt+turnier@example.test');
    expect(parsed.searchParams.get('subject')).toContain('Herbstturnier & Mêlée');
    const body = parsed.searchParams.get('body');
    expect(body).toContain('Herbstturnier & Mêlée');
    expect(body).toContain('2099');
    expect(body).toContain('10:30');
    expect(body).toContain('Europe/Berlin');
    expect(body).toContain('Parkweg 1, Linden');
    expect(body).toContain('https://ptm.test/turniere/t1/info');
    expect(body).toContain(messageLabel);
    expect(body).toContain('\r\n');

    const action = emailAction('contact', href, language, 'secondary');
    const dom = new JSDOM(renderTransactionalEmailHtml('Test', 'Hallo!', language, null, '', [action]));
    try {
      const links = messageLinks(dom.window.document, href);
      expect(links).toHaveLength(1);
      expect(links[0].textContent).toBe('✉' + label);
      expect(dom.window.document.body.textContent).not.toContain('mailto:');
    } finally {
      dom.window.close();
    }
  });

  it('lässt den Kontaktbutton ohne gültige Kontaktadresse weg und verwendet nicht die Absenderadresse', () => {
    for (const email of [null, '', 'kein-email', 'kontakt@example.test\r\nBcc:other@example.test']) {
      expect(buildTournamentContactLink({ ...tournament, contact_email: email, email: 'absender@example.test' }, 'https://ptm.test', 'de')).toBe('');
    }
  });

  it('unterstützt API-Feldnamen und den deutschen Sprach-Fallback', () => {
    const href = buildTournamentContactLink({ id: 't2', name: 'Turnier', date: '2099-10-01', startTime: '14:00', contactEmail: 'kontakt@example.test' }, 'https://ptm.test', 'xx');
    const parsed = new URL(href);
    expect(parsed.searchParams.get('subject')).toContain('Nachricht zum Turnier');
    expect(parsed.searchParams.get('body')).toContain('14:00');
    expect(parsed.searchParams.get('body')).not.toContain('undefined');
  });

  it('liefert den Kontaktentwurf auch im Klartextteil der tatsächlich versendeten Mail', async () => {
    const href = buildTournamentContactLink(tournament, 'https://ptm.test', 'de');
    const action = emailAction('contact', href, 'de', 'secondary');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
    const message = {
      body: { to: 'spieler@example.test', subject: 'Testturnier', text: 'Hallo!', language: 'de', actions: [action] },
      ack: vi.fn(), retry: vi.fn(),
    };
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const pending = worker.queue({ messages: [message] }, { RESEND_API_KEY: 'test-key', MAIL_FROM: 'noreply@example.test' });
      await vi.runAllTimersAsync();
      await pending;
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent.text).toContain(`Nachricht an Turnierleitung:\n${href}`);
      expect(sent.html).toContain('✉</span>Nachricht an Turnierleitung</a>');
      expect(sent.html).not.toContain(`>${href}</a>`);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe('Aktionslinks nach einer Teamnachricht', () => {
  it('setzt Buttons beim zugehörigen Absatz und erhält Nachrichteninhalt und sonstige Links', () => {
    const actions = ['tournament', 'directions', 'whatsapp'].map((kind) => emailAction(kind, urls[kind], 'de'));
    const after = `\n\nAlle Infos zum Turnier:\n${urls.tournament}\n\nAnfahrt:\n${urls.directions}\n\nWhatsApp:\n${urls.whatsapp}`;
    const dom = new JSDOM(renderTransactionalEmailHtml('Nachricht', 'Hallo Lea!', 'de', 'Bitte Lizenz mitbringen. https://example.test/info', after, actions));
    try {
      const document = dom.window.document;
      expect(document.body.textContent).toContain('Bitte Lizenz mitbringen.');
      expect(messageLinks(document, 'https://example.test/info')).toHaveLength(1);
      for (const action of actions) {
        expect(messageLinks(document, action.url)).toHaveLength(1);
        expect(document.body.textContent).not.toContain(action.url);
      }
      expect(document.body.textContent.indexOf('Bitte Lizenz mitbringen.')).toBeLessThan(document.body.textContent.indexOf('Turnier ansehen'));
      expect(document.body.textContent.indexOf('Turnier ansehen')).toBeLessThan(document.body.textContent.indexOf('Anfahrt:'));
    } finally {
      dom.window.close();
    }
  });

  it('gibt auch bei wiederholtem Link oder wiederholter Aktion nur einen Button aus', () => {
    const action = emailAction('tournament', urls.tournament, 'de');
    const dom = new JSDOM(renderTransactionalEmailHtml('Test', urls.tournament, 'de', null, `\n\nInfos:\n${urls.tournament}`, [action, action]));
    try {
      expect(messageLinks(dom.window.document, action.url)).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });
});
