import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerExchangePage from './PlayerExchangePage.jsx';
import '../lib/i18next-config.js';

// Ohne Koordinaten, damit die Karte (Leaflet) in jsdom nicht gerendert wird.
function listing(index) {
  return { id: `l-${index}`, type: 'tournament', title: `Gesuch ${index}`, description: null, playingPosition: 'egal', locationName: 'Musterstadt', latitude: null, longitude: null, eventDate: null };
}

function renderPage() {
  return render(
    <PlayerExchangePage
      language="de"
      setLanguage={() => {}}
      menuOpen={false}
      setMenuOpen={() => {}}
      navigate={() => {}}
      currentUser={null}
      isAdmin={false}
    />,
  );
}

describe('Boule-Treff: Einstieg über ?anzeige=<id>', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    const listings = Array.from({ length: 15 }, (_, index) => listing(index + 1));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ listings }), { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('blendet auch eine Anzeige jenseits der ersten Seite ein und hebt sie hervor', async () => {
    window.history.replaceState({}, '', '/spielerboerse?anzeige=l-14');

    renderPage();

    const heading = await screen.findByRole('heading', { name: 'Gesuch 14' });
    const card = heading.closest('article');
    expect(card).toHaveClass('highlighted');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Gesuch 1' }).closest('article')).not.toHaveClass('highlighted');
  });

  it('meldet eine nicht mehr vorhandene Anzeige', async () => {
    window.history.replaceState({}, '', '/spielerboerse?anzeige=weg');

    renderPage();

    expect(await screen.findByText('Dieses Mitspielgesuch ist nicht mehr verfügbar.')).toBeInTheDocument();
  });

  it('zeigt ohne Parameter nur die erste Seite ohne Hervorhebung', async () => {
    window.history.replaceState({}, '', '/spielerboerse');

    renderPage();

    await screen.findByRole('heading', { name: 'Gesuch 1' });
    expect(screen.queryByRole('heading', { name: 'Gesuch 14' })).not.toBeInTheDocument();
    expect(document.querySelector('.place-card.highlighted')).toBeNull();
  });
});
