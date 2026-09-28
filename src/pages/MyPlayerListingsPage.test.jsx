import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyPlayerListingsPage } from './MyPlayerListingsPage.jsx';
import '../lib/i18next-config.js';

const ownListing = {
  id: 'l-9', type: 'tournament', title: 'Mein Gesuch', description: null, playingPosition: 'egal',
  locationName: 'Boulodrome Nord', latitude: 51.2, longitude: 6.8, eventDate: '2099-05-01', tournamentId: null,
};

function stubApi() {
  vi.stubGlobal('fetch', vi.fn((path) => {
    const body = String(path).startsWith('/api/player-listings/mine') ? { listings: [ownListing] } : { places: [], tournaments: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }));
}

function renderPage() {
  return render(
    <MyPlayerListingsPage
      language="de"
      setLanguage={() => {}}
      menuOpen={false}
      setMenuOpen={() => {}}
      navigate={() => {}}
      currentUser={{ id: 'u-1', role: 'user' }}
      isAdmin={false}
    />,
  );
}

describe('Meine Mitspielgesuche', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('öffnet über ?bearbeiten=<id> direkt den Bearbeiten-Dialog', async () => {
    window.history.replaceState({}, '', '/meine-anzeigen?bearbeiten=l-9');
    stubApi();

    renderPage();

    expect(await screen.findByText('Mitspielgesuch bearbeiten')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mein Gesuch')).toBeInTheDocument();
  });

  it('öffnet ohne Parameter keinen Dialog', async () => {
    window.history.replaceState({}, '', '/meine-anzeigen');
    stubApi();

    renderPage();

    expect(await screen.findByText('Mein Gesuch')).toBeInTheDocument();
    expect(screen.queryByText('Mitspielgesuch bearbeiten')).not.toBeInTheDocument();
  });
});
