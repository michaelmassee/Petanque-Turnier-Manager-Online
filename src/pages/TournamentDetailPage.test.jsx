import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function renderDetail(tournament, view = 'info') {
  return render(
    <TournamentDetailPage
      route={{ id: tournament.id, view }}
      tournaments={[tournament]}
      currentUser={null}
      language="de"
      setLanguage={() => {}}
      navigate={() => {}}
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

