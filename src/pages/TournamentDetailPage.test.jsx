import { describe, expect, it, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { matchTournamentRoute } from '../lib/routing.js';
import { TournamentDetailPage } from './TournamentDetailPage.jsx';

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

function tournamentWith(overrides) {
  return {
    id: 't1',
    name: 'Testturnier',
    date: '2099-06-01',
    type: 'schweizer',
    visibility: 'public',
    participantsPublic: true,
    registrationEnabled: true,
    status: 'registration',
    location: {},
    ...overrides,
  };
}

function renderDetail(tournament, view = 'info', navigate = () => {}) {
  return render(
    <TournamentDetailPage
      route={{ id: tournament.id, view }}
      tournaments={[tournament]}
      currentUser={null}
      language="de"
      setLanguage={() => {}}
      navigate={navigate}
      menuOpen={false}
      setMenuOpen={() => {}}
      registrationForm={EMPTY_REGISTRATION_FORM}
      setRegistrationForm={() => {}}
      onSubmitRegistration={() => {}}
      registrationSaving={false}
      message=""
      error=""
      setMessage={() => {}}
      setError={() => {}}
    />,
  );
}

function tabNames() {
  const nav = screen.getByRole('navigation', { name: 'Turnierdetails' });
  return Array.from(nav.querySelectorAll('button')).map((button) => button.textContent);
}

describe('Turnierdetail-Reiter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt den ausrichtenden Verein zwischen Datum und Ort', () => {
    renderDetail(tournamentWith({ club: 'BC Linden', location: 'Parkweg 1, Linden' }));
    const labels = Array.from(document.querySelectorAll('p > strong')).map((label) => label.textContent);
    expect(labels.slice(labels.indexOf('Datum'), labels.indexOf('Datum') + 3)).toEqual(['Datum', 'Verein', 'Ort']);
    const meta = Array.from(document.querySelectorAll('.tournament-detail-meta > span')).map((line) => line.textContent);
    expect(meta).toHaveLength(3);
    expect(meta[1]).toBe('BC Linden');
    expect(meta[2]).toContain('Parkweg 1');
  });

  it('lässt die Vereinszeile ohne Verein weg', () => {
    renderDetail(tournamentWith({ club: null }));
    expect(Array.from(document.querySelectorAll('p > strong')).map((label) => label.textContent)).not.toContain('Verein');
  });

  it('verlinkt den gespeicherten Bouleplatz aus einem Kalendereintrag mit dem Platzfilter', () => {
    const navigate = vi.fn();
    renderDetail(tournamentWith({ registrationEnabled: false, boulePlaceId: 'place-14' }), 'info', navigate);

    const link = screen.getByRole('link', { name: 'Bouleplatz ansehen' });
    expect(link).toHaveAttribute('href', '/plaetze#place-14');
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/plaetze#place-14');
  });

  it('erkennt die Mitspieler-Route', () => {
    expect(matchTournamentRoute('/turniere/t1/mitspieler')).toEqual({ id: 't1', view: 'mitspieler' });
  });

  it('zeigt vor dem Turnierstart Mitspieler statt Spielplan', () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ listings: [] })));

    renderDetail(tournamentWith({ status: 'registration' }));

    const tabs = tabNames();
    expect(tabs).toContain('Mitspieler');
    expect(tabs).not.toContain('Spielplan');
  });

  it('zeigt nach dem Turnierstart Spielplan statt Mitspieler', () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ rounds: [], ranking: [] })));

    renderDetail(tournamentWith({ status: 'running' }));

    const tabs = tabNames();
    expect(tabs).toContain('Spielplan');
    expect(tabs).not.toContain('Mitspieler');
  });

  it('zeigt die veröffentlichte Endrangliste im eigenen Reiter, auch ohne „Teilnehmer öffentlich“', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      ranking: [{ rank: 1, teamId: 'a', wins: 1, pointsFor: 13, pointsAgainst: 7, members: [{ id: 'p1', firstName: 'Anna', lastName: 'Test' }] }],
      publishedAt: '2099-06-01T18:00:00.000Z',
    })));

    renderDetail(tournamentWith({ status: 'finished', participantsPublic: false, rankingPublishedAt: '2099-06-01T18:00:00.000Z', club: 'BC Linden' }), 'rangliste');

    expect(tabNames()).toContain('Rangliste');
    expect(await screen.findByText('Anna Test')).toBeInTheDocument();
    expect(document.querySelector('.final-ranking-header img[src="/icons/logo.png"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'PDF herunterladen' })).toBeEnabled();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/ranking', expect.anything());
  });

  it('erkennt die Ranglisten-Route und blendet den Reiter ohne Veröffentlichung aus', () => {
    expect(matchTournamentRoute('/turniere/t1/rangliste')).toEqual({ id: 't1', view: 'rangliste' });
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ rounds: [], ranking: [] })));

    renderDetail(tournamentWith({ status: 'finished' }), 'rangliste');

    expect(tabNames()).not.toContain('Rangliste');
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-current', 'page');
  });

  it('zeigt die Mitspielgesuche im eigenen Reiter', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ listings: [] })));

    renderDetail(tournamentWith({ status: 'registration' }), 'mitspieler');

    expect(await screen.findByText('Mitspielgesuche zu diesem Turnier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mitspieler' })).toHaveAttribute('aria-current', 'page');
  });

  it('fällt bei einem nicht mehr verfügbaren Reiter auf Info zurück', () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ rounds: [], ranking: [] })));

    renderDetail(tournamentWith({ status: 'running' }), 'mitspieler');

    expect(screen.queryByText('Mitspielgesuche zu diesem Turnier')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('aria-current', 'page');
  });

  it('zeigt über den Anmelde-/QR-Link bei geschlossener Anmeldung die Info mit Grund', () => {
    renderDetail(tournamentWith({ registrationClosed: true }), 'anmelden');

    expect(screen.getByText(/Eine Online-Anmeldung ist derzeit nicht möglich: Anmeldung geschlossen/)).toBeInTheDocument();
    expect(tabNames()).not.toContain('Anmelden');
  });

  it('erklärt bei Kalendereinträgen, dass es keine Online-Anmeldung gibt', () => {
    renderDetail(tournamentWith({ registrationEnabled: false }), 'anmelden');

    expect(screen.getByText('Für dieses Turnier gibt es keine Online-Anmeldung.')).toBeInTheDocument();
  });

  it('zeigt bei offener Anmeldung keinen Hinweis', () => {
    renderDetail(tournamentWith({}), 'anmelden');

    expect(screen.queryByText(/Eine Online-Anmeldung ist derzeit nicht möglich/)).not.toBeInTheDocument();
  });

  it('zeigt bei unbekanntem festem QR-Link „Turnier nicht gefunden“', async () => {
    const route = matchTournamentRoute('/q/unbekannterSchluessel0001');
    expect(route).toEqual({ id: '', view: 'info' });

    render(
      <TournamentDetailPage
        route={route} tournaments={[]} currentUser={null} language="de" setLanguage={() => {}} navigate={() => {}}
        menuOpen={false} setMenuOpen={() => {}} registrationForm={EMPTY_REGISTRATION_FORM} setRegistrationForm={() => {}}
        onSubmitRegistration={() => {}} registrationSaving={false} message="" error="" setMessage={() => {}} setError={() => {}}
      />,
    );

    expect(await screen.findByText('Turnier nicht gefunden')).toBeInTheDocument();
  });
});


describe('Öffentliche Meldeliste', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt hinter jedem mit einem Konto verknüpften Teammitglied das User-Symbol', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      participants: [{ firstName: 'Anna', lastName: 'Konto', accountConnected: true, partnerFirstName: 'Ben', partnerLastName: 'Ohne', partnerAccountConnected: false,
        partner2FirstName: 'Cleo', partner2LastName: 'Konto', partner2AccountConnected: true }],
      waitlist: [],
    })));

    renderDetail(tournamentWith({}), 'teilnehmer');

    const anna = (await screen.findByText(/Anna/)).closest('strong');
    expect(anna.querySelector('.account-badge')).not.toBeNull();
    expect(screen.getByText(/Ben/).closest('strong').querySelector('.account-badge')).toBeNull();
    expect(screen.getByText(/Cleo/).closest('strong').querySelector('.account-badge')).not.toBeNull();
  });

  it.each([
    ['pending', 'Deine Anmeldung wartet noch auf die Bestätigung der Turnierleitung und ist nur für dich sichtbar.'],
    ['waitlist', 'Deine Anmeldung steht auf der Warteliste und ist nur für dich sichtbar.'],
  ])('zeigt die eigene %s-Anmeldung mit Hinweis und bietet die Abmeldung an', async (status, hint) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (String(path).endsWith('/participants')) return jsonResponse({
        participants: [], ownUnconfirmed: [{ registrationId: 'r1', firstName: 'Anna', lastName: 'Wartet', status }],
      });
      if (String(path) === '/api/registrations/r1/cancel') return jsonResponse({ registration: { id: 'r1', status: 'cancelled' } });
      throw new Error(`Unerwartete Anfrage: ${path}`);
    });

    renderDetail(tournamentWith({}), 'teilnehmer');

    expect(await screen.findByText(hint)).toBeInTheDocument();
    expect(screen.getByText('Anna Wartet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Absagen' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/registrations/r1/cancel', expect.objectContaining({ method: 'POST' })));
  });

  it('bietet dem angemeldeten Teammitglied die Abmeldung in der Teilnehmerliste an', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options = {}) => {
      if (String(path).endsWith('/participants')) return jsonResponse({ participants: [{ registrationId: 'r1', firstName: 'Anna', lastName: 'Anmeldung' }], ownUnconfirmed: [] });
      if (String(path) === '/api/registrations/r1/cancel') return jsonResponse({ registration: { id: 'r1', status: 'cancelled' } });
      throw new Error(`Unerwartete Anfrage: ${path} ${options.method || 'GET'}`);
    });

    renderDetail(tournamentWith({}), 'teilnehmer');
    fireEvent.click(await screen.findByRole('button', { name: 'Absagen' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/registrations/r1/cancel', expect.objectContaining({ method: 'POST' })));
  });

  it('versteckt die Abmeldung für einen bloß sichtbaren Teilnehmer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({
      participants: [{ registrationId: null, firstName: 'Anna', lastName: 'Anmeldung' }], ownUnconfirmed: [],
    }));

    renderDetail(tournamentWith({}), 'teilnehmer');

    expect(await screen.findByText('Anna Anmeldung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absagen' })).not.toBeInTheDocument();
  });
});
