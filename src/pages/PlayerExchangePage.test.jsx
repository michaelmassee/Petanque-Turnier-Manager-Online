import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerExchangePage from './PlayerExchangePage.jsx';
import '../lib/i18next-config.js';

// Ohne Koordinaten, damit die Karte (Leaflet) in jsdom nicht gerendert wird.
function listing(index) {
  return { id: `l-${index}`, type: 'tournament', title: `Gesuch ${index}`, description: null, playingPosition: 'egal', locationName: 'Musterstadt', latitude: null, longitude: null, eventDate: null };
}

function renderPage(language = 'de') {
  return render(
    <PlayerExchangePage
      language={language}
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
    // Das Scrollen läuft in einem useEffect nach dem Rendern – darauf warten.
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(Element.prototype.scrollIntoView.mock.contexts).toContain(card);
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

describe('Boule-Treff: Anzeige teilen', () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ listings: [listing(1), listing(2)] }), { status: 200 }))));
    window.history.replaceState({}, '', '/spielerboerse');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  async function shareButtonOf(title) {
    const card = (await screen.findByRole('heading', { name: title })).closest('article');
    return { card, button: within(card).getByRole('button', { name: 'Teilen' }) };
  }

  it('teilt Überschrift und Link der Anzeige über den Teilen-Dialog, auch für Gäste', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    renderPage();
    const { button } = await shareButtonOf('Gesuch 2');
    fireEvent.click(button);

    await vi.waitFor(() => expect(share).toHaveBeenCalledWith({
      title: 'Gesuch 2',
      text: 'Gesuch 2',
      url: `${window.location.origin}/spielerboerse?anzeige=l-2`,
    }));
  });

  it('kopiert ohne Teilen-Dialog Überschrift und Link und meldet das in der Karte', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderPage();
    const { card, button } = await shareButtonOf('Gesuch 1');
    fireEvent.click(button);

    expect(await within(card).findByText('Link kopiert')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(`Gesuch 1\n${window.location.origin}/spielerboerse?anzeige=l-1`);
    expect(within((await screen.findByRole('heading', { name: 'Gesuch 2' })).closest('article')).queryByText('Link kopiert')).not.toBeInTheDocument();
  });

  it('bleibt still, wenn der Teilen-Dialog abgebrochen wird', async () => {
    const abort = Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(abort), configurable: true });

    renderPage();
    const { card, button } = await shareButtonOf('Gesuch 1');
    fireEvent.click(button);

    await vi.waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Boule-Treff: Datum', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ listings: [{ ...listing(1), eventDate: '2099-05-01' }] }), { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formatiert das Datum eines Turniergesuchs in der gewählten Anzeigesprache', async () => {
    renderPage('en');

    expect(await screen.findByText(/5\/1\/2099/)).toBeInTheDocument();
  });
});
