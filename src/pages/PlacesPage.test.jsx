import { forwardRef, useImperativeHandle } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlacesPage, { filterPlaces, groupMapPlaces, groupPlacesByOrganization } from './PlacesPage.jsx';
import '../lib/i18next-config.js';

const map = vi.hoisted(() => ({ flyTo: vi.fn(), getZoom: vi.fn(() => 12), openPopup: vi.fn() }));
const mapBounds = vi.hoisted(() => ({ report: null }));

vi.mock('react-leaflet', () => ({
  Marker: forwardRef(function Marker({ children, position }, ref) {
    useImperativeHandle(ref, () => ({ openPopup: map.openPopup }));
    return <div data-testid="place-marker" data-position={position.join(',')}>{children}</div>;
  }),
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({ flyTo: map.flyTo, getZoom: map.getZoom }),
}));

vi.mock('../components/TileFallbackMap.jsx', () => ({
  TileFallbackMap: ({ children }) => <div>{children}</div>,
  FitToBounds: () => null,
  ReportMapBounds: ({ onChange }) => { mapBounds.report = onChange; return null; },
}));

function boundsBetween(south, west, north, east) {
  return { contains: ([lat, lng]) => lat >= south && lat <= north && lng >= west && lng <= east };
}

function place(index, overrides = {}) {
  return {
    id: `place-${index}`,
    name: `Bouleplatz ${index}`,
    address: `Parkweg ${index}, Linden`,
    venueType: 'outdoor',
    courtCount: 4,
    latitude: 50 + index / 100,
    longitude: 8 + index / 100,
    likeCount: 0,
    liked: false,
    favorited: false,
    ...overrides,
  };
}

function renderPlacesPage() {
  return render(
    <PlacesPage
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

describe('Kartenmarker für Bouleplätze', () => {
  it('fasst Platz und Halle eines Vereins an derselben Adresse zusammen', () => {
    const groups = groupMapPlaces([
      { id: 'outdoor', clubId: 'club-1', address: 'Parkweg 1, Linden', venueType: 'outdoor' },
      { id: 'indoor', clubId: 'club-1', address: ' parkweg 1, linden ', venueType: 'indoor' },
      { id: 'other-address', clubId: 'club-1', address: 'Hallenweg 2, Linden', venueType: 'indoor' },
      { id: 'independent', clubId: null, address: 'Parkweg 1, Linden', venueType: 'outdoor' },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.place.id === 'outdoor')?.places.map((place) => place.id)).toEqual(['outdoor', 'indoor']);
  });

  it('filtert Vereine und Boulehallen auch kombiniert', () => {
    const places = [
      { id: 'club-place', clubId: 'club-1', venueType: 'outdoor' },
      { id: 'club-hall', clubId: 'club-1', venueType: 'indoor' },
      { id: 'independent-hall', clubId: null, venueType: 'indoor' },
    ];

    expect(filterPlaces(places, { clubsOnly: true }).map((place) => place.id)).toEqual(['club-place', 'club-hall']);
    expect(filterPlaces(places, { indoorOnly: true }).map((place) => place.id)).toEqual(['club-hall', 'independent-hall']);
    expect(filterPlaces(places, { clubsOnly: true, indoorOnly: true }).map((place) => place.id)).toEqual(['club-hall']);
  });

  it('behandelt einen vorhandenen Vereinsnamen auch ohne Organisations-ID als Verein', () => {
    const place = { id: 'legacy-club-place', clubId: null, clubName: 'Boules Brothers Ostheim', address: 'Limesstraße 10-12, Ostheim', venueType: 'outdoor' };

    expect(filterPlaces([place], { clubsOnly: true })).toEqual([place]);
    expect(groupMapPlaces([place])[0].id).toBe('club:boules brothers ostheim:limesstraße 10-12, ostheim');
  });

  it('fasst die Plätze eines Vereins unabhängig von ihren Adressen in einem Listenbereich zusammen', () => {
    const groups = groupPlacesByOrganization([
      { id: 'outdoor', clubId: 'club-1', clubName: 'BC Linden', clubDescription: 'Gemeinsam Boule spielen', clubLogoUrl: 'https://example.test/logo.png', address: 'Parkweg 1, Linden' },
      { id: 'indoor', clubId: 'club-1', clubName: 'BC Linden', address: 'Hallenweg 2, Linden' },
      { id: 'independent', clubId: null, clubName: null, address: 'Dorfplatz 3, Linden' },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ clubName: 'BC Linden', clubDescription: 'Gemeinsam Boule spielen', places: [{ id: 'outdoor', clubLogoUrl: 'https://example.test/logo.png' }, { id: 'indoor' }] });
    expect(groups[1]).toMatchObject({ clubName: null, places: [{ id: 'independent' }] });
  });
});

describe('Bouleplatz-Deep-Link aus Turnierdetails', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    map.flyTo.mockReset();
    map.getZoom.mockReturnValue(12);
    map.openPopup.mockReset();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ places: Array.from({ length: 15 }, (_, index) => place(index + 1)) }), { status: 200 }))));
    window.history.replaceState({}, '', '/plaetze#place-14');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('filtert Liste und Karte auf den verknüpften Platz und öffnet dessen Details', async () => {
    renderPlacesPage();

    const heading = await screen.findByRole('heading', { name: 'Bouleplatz 14' }, { timeout: 5_000 });
    const details = heading.closest('details');
    expect(details).toHaveAttribute('open');
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 1' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('place-marker')).toHaveLength(1);
    expect(screen.getByTestId('place-marker')).toHaveAttribute('data-position', '50.14,8.14');
    expect(screen.getByRole('button', { name: '1 gefundene Bouleplätze – zur Liste springen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entfernen: Bouleplatz 14' })).toBeInTheDocument();
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled(), { timeout: 5_000 });
    expect(Element.prototype.scrollIntoView.mock.contexts).toContain(details);
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalledWith([50.14, 8.14], 15), { timeout: 5_000 });
    expect(map.openPopup).toHaveBeenCalled();
  });

  it('scrollt nur einmal zur verknüpften Detailkarte und lässt spätere Kartenklicks unberührt', async () => {
    renderPlacesPage();
    const heading = await screen.findByRole('heading', { name: 'Bouleplatz 14' }, { timeout: 5_000 });
    const details = heading.closest('details');
    await vi.waitFor(() => expect(map.flyTo).toHaveBeenCalledWith([50.14, 8.14], 15), { timeout: 5_000 });
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView.mock.contexts).toContain(details), { timeout: 5_000 });
    expect(Element.prototype.scrollIntoView.mock.contexts.filter((element) => element === details)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen: Bouleplatz 14' }));
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('button', { name: '15 gefundene Bouleplätze – zur Liste springen' })).toBeInTheDocument();
    expect(screen.getAllByTestId('place-marker')).toHaveLength(15);
    expect(fetch).toHaveBeenCalledOnce();
    Element.prototype.scrollIntoView.mockClear();

    const otherDetails = screen.getByRole('heading', { name: 'Bouleplatz 1' }).closest('details');
    fireEvent.click(within(otherDetails).getByRole('button', { name: 'Karte', hidden: true }));

    await vi.waitFor(() => expect(map.flyTo).toHaveBeenLastCalledWith([50.01, 8.01], 15), { timeout: 5_000 });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(Element.prototype.scrollIntoView.mock.contexts).not.toContain(details);
  });

  it('zeigt auch bei mehreren Spielorten eines Vereins nur den verknüpften Spielort', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ places: [
      place(14, { clubId: 'club-1', clubName: 'BC Linden' }),
      place(15, { clubId: 'club-1', clubName: 'BC Linden', venueType: 'indoor' }),
    ] }), { status: 200 }));
    renderPlacesPage();

    expect(await screen.findByRole('heading', { name: 'Bouleplatz 14' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 15' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bouleplatz 15 (Boulehalle)')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('place-marker')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'BC Linden' }).closest('details')).toHaveAttribute('open');
  });

  it('zeigt bei einem nicht verfügbaren verknüpften Platz keine anderen Plätze', async () => {
    window.history.replaceState({}, '', '/plaetze#missing-place');
    renderPlacesPage();

    expect(await screen.findByText('Noch keine veröffentlichten Bouleplätze gefunden.', {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryAllByTestId('place-marker')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen: missing-place' }));
    expect(screen.getByRole('heading', { name: 'Bouleplatz 1' })).toBeInTheDocument();
  });

  it('scrollt bei jedem Kartenklick nach der Markeraktualisierung zur Karte', async () => {
    window.history.replaceState({}, '', '/plaetze');
    const { container } = renderPlacesPage();
    const heading = await screen.findByRole('heading', { name: 'Bouleplatz 1' }, { timeout: 5_000 });
    const details = heading.closest('details');
    fireEvent.click(within(details).getByText('Bouleplatz 1'));
    const button = within(details).getByRole('button', { name: 'Karte' });
    const mapPanel = container.querySelector('.places-map-panel');

    for (let click = 0; click < 2; click += 1) {
      map.flyTo.mockClear();
      map.openPopup.mockClear();
      Element.prototype.scrollIntoView.mockClear();
      fireEvent.click(button);

      expect(map.flyTo).toHaveBeenCalledWith([50.01, 8.01], 15);
      expect(map.openPopup).toHaveBeenCalled();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' });
      expect(Element.prototype.scrollIntoView.mock.contexts).toEqual([mapPanel]);
      expect(map.openPopup.mock.invocationCallOrder[0]).toBeLessThan(Element.prototype.scrollIntoView.mock.invocationCallOrder[0]);
    }
  });
});


describe('Bouleplätze und Vereine teilen', () => {
  const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    window.history.replaceState({}, '', '/plaetze');
    Object.defineProperty(navigator, 'share', { get: () => undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { get: () => undefined, configurable: true });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ places: [
      place(1, { clubId: 'club-1', clubName: 'BC Linden' }),
      place(2, { clubId: 'club-1', clubName: 'BC Linden', venueType: 'indoor' }),
      place(3),
    ] }), { status: 200 }))));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
    else delete navigator.share;
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete navigator.clipboard;
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  async function shareButton(target) {
    renderPlacesPage();
    const heading = await screen.findByRole('heading', { name: target }, { timeout: 5_000 });
    const details = heading.closest('details');
    // Vereinsaktionen stehen vor den Aktionen der enthaltenen Spielorte.
    return within(details).getAllByRole('button', { name: 'Teilen', hidden: true })[0];
  }

  it.each([
    ['Bouleplatz 1', '/plaetze#place-1'],
    ['BC Linden', '/plaetze?verein=club-1'],
  ])('teilt %s als Gast mit Name und direktem Link', async (name, path) => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, 'share', 'get').mockReturnValue(share);
    fireEvent.click(await shareButton(name));
    await vi.waitFor(() => expect(share).toHaveBeenCalledWith({ title: name, text: name, url: `${window.location.origin}${path}` }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('kopiert Name und Link und zeigt die Rückmeldung am Platz', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator, 'share', 'get').mockReturnValue(undefined);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText });
    const button = await shareButton('Bouleplatz 3');
    fireEvent.click(button);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(`Bouleplatz 3\n${window.location.origin}/plaetze#place-3`));
    expect(await within(button.parentElement).findByText('Link kopiert')).toBeInTheDocument();
  });

  it('bleibt beim Abbrechen des Teilen-Dialogs still', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Abgebrochen', 'AbortError'));
    vi.spyOn(navigator, 'share', 'get').mockReturnValue(share);
    fireEvent.click(await shareButton('BC Linden'));
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(screen.queryByText('Teilen wird von diesem Gerät nicht unterstützt')).not.toBeInTheDocument();
  });

  it('meldet fehlende Unterstützung direkt am Button', async () => {
    vi.spyOn(navigator, 'share', 'get').mockReturnValue(undefined);
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined);
    const button = await shareButton('BC Linden');
    fireEvent.click(button);
    expect(await within(button.parentElement).findByText('Teilen wird von diesem Gerät nicht unterstützt')).toBeInTheDocument();
  });

  it('öffnet einen geteilten Verein mit allen Spielorten und lässt den Filter entfernen', async () => {
    window.history.replaceState({}, '', '/plaetze?verein=club-1');
    renderPlacesPage();
    const heading = await screen.findByRole('heading', { name: 'BC Linden' }, { timeout: 5_000 });
    const details = heading.closest('details');
    expect(details).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Bouleplatz 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bouleplatz 2' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 3' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('place-marker')).toHaveLength(2);
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView.mock.contexts).toContain(details));
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen: BC Linden' }));
    expect(window.location.search).toBe('');
    expect(screen.getByRole('heading', { name: 'Bouleplatz 3' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('Ungeprüfte Platzadresse', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('kennzeichnet die Adresse und schickt angemeldet eine Korrektur', async () => {
    const fetchMock = vi.fn((url) => Promise.resolve(new Response(JSON.stringify(String(url).includes('address-correction')
      ? { ok: true }
      : { places: [place(1, { addressUnverified: true }), place(2)] }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlacesPage language="de" setLanguage={() => {}} menuOpen={false} setMenuOpen={() => {}} navigate={() => {}} currentUser={{ id: 'u1' }} isAdmin={false} />);

    const details = (await screen.findByRole('heading', { name: 'Bouleplatz 1' }, { timeout: 5_000 })).closest('details');
    expect(within(details).getByText(/Adresse ungeprüft:/)).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Bouleplatz 2' }).closest('details')).queryByText(/Adresse ungeprüft/)).not.toBeInTheDocument();

    fireEvent.click(within(details).getByRole('button', { name: 'Korrektur melden', hidden: true }));
    fireEvent.change(screen.getByRole('textbox', { name: /Wo liegt der Spielort tatsächlich/ }), { target: { value: 'Limesstraße' } });
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));

    expect(await screen.findByText('Danke! Deine Korrektur ist an die Verantwortlichen des Spielorts gegangen.')).toBeInTheDocument();
    const [url, options] = fetchMock.mock.calls.find(([path]) => String(path).includes('address-correction'));
    expect(url).toBe('/api/places/place-1/address-correction');
    expect(JSON.parse(options.body)).toEqual({ body: 'Limesstraße' });
  });
});

describe('Übernahme eines Admin-Vereins anfragen', () => {
  afterEach(() => vi.unstubAllGlobals());

  const clubPlace = (overrides) => place(1, { clubId: 'club-1', clubName: 'BC Linden', clubOwnedByAdmin: true, canEdit: false, ...overrides });
  function renderWith(places, { currentUser = { id: 'u1' }, isAdmin = false } = {}) {
    const fetchMock = vi.fn((url) => Promise.resolve(new Response(JSON.stringify(String(url).includes('/api/postbox/messages')
      ? { message: {}, recipientCount: 2 }
      : { places }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlacesPage language="de" setLanguage={() => {}} menuOpen={false} setMenuOpen={() => {}} navigate={() => {}} currentUser={currentUser} isAdmin={isAdmin} />);
    return fetchMock;
  }

  it('schickt die Anfrage als Nachricht an alle Admins', async () => {
    const fetchMock = renderWith([clubPlace()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Verein übernehmen?', hidden: true }, { timeout: 5_000 }));

    const text = screen.getByRole('textbox', { name: /Nachricht an Admin/ });
    expect(text).toHaveValue('Ich bin für den Verein „BC Linden“ zuständig und möchte ihn übernehmen.');
    fireEvent.change(text, { target: { value: 'Ich bin Vorsitzender von BC Linden.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));

    expect(await screen.findByText('Deine Anfrage ist an alle Admins gegangen. Die Antwort bekommst du in deiner Postbox.')).toBeInTheDocument();
    const [, options] = fetchMock.mock.calls.find(([path]) => path === '/api/postbox/messages');
    expect(JSON.parse(options.body)).toEqual({ recipientId: 'group:admins', body: 'Ich bin Vorsitzender von BC Linden.' });
  });

  it('bietet die Übernahme nur angemeldeten Nicht-Admins bei Admin-Vereinen an, die sie nicht schon bearbeiten', async () => {
    renderWith([clubPlace({ clubOwnedByAdmin: false })]);
    await screen.findByRole('heading', { name: 'BC Linden' }, { timeout: 5_000 });
    expect(screen.queryByRole('button', { name: 'Verein übernehmen?', hidden: true })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it.each([
    ['ohne Anmeldung', { currentUser: null }, {}],
    ['für Admins', { isAdmin: true }, {}],
    ['für Bearbeiter des Vereins', {}, { canEdit: true }],
  ])('zeigt keine Übernahme %s', async (_label, options, overrides) => {
    renderWith([clubPlace(overrides)], options);
    await screen.findByRole('heading', { name: 'BC Linden' }, { timeout: 5_000 });
    expect(screen.queryByRole('button', { name: 'Verein übernehmen?', hidden: true })).not.toBeInTheDocument();
  });
});

describe('Liste nach Kartenausschnitt', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mapBounds.report = null;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ places: Array.from({ length: 5 }, (_, index) => place(index + 1)) }), { status: 200 }))));
    window.history.replaceState({}, '', '/plaetze');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('zeigt nur Plätze im sichtbaren Ausschnitt, die Karte behält alle Marker', async () => {
    renderPlacesPage();
    await screen.findByRole('heading', { name: 'Bouleplatz 5' }, { timeout: 5_000 });

    act(() => mapBounds.report(boundsBetween(50.015, 8.015, 50.035, 8.035)));

    expect(screen.getByRole('heading', { name: 'Bouleplatz 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bouleplatz 3' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 5' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('place-marker')).toHaveLength(5);
    expect(screen.getByRole('button', { name: '5 gefundene Bouleplätze – zur Liste springen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Nur Plätze im Kartenausschnitt' }));
    expect(screen.getByRole('heading', { name: 'Bouleplatz 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bouleplatz 5' })).toBeInTheDocument();
  });

  it('weist auf einen leeren Kartenausschnitt hin', async () => {
    renderPlacesPage();
    await screen.findByRole('heading', { name: 'Bouleplatz 1' }, { timeout: 5_000 });

    act(() => mapBounds.report(boundsBetween(10, 10, 11, 11)));

    expect(screen.getByText('Keine Bouleplätze im Kartenausschnitt. Verschiebe oder verkleinere die Karte.')).toBeInTheDocument();
    expect(screen.queryByText('Noch keine veröffentlichten Bouleplätze gefunden.')).not.toBeInTheDocument();
  });
});

describe('Aktionen im Kartenpopup', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ places: Array.from({ length: 15 }, (_, index) => place(index + 1)) }), { status: 200 }))));
    window.history.replaceState({}, '', '/plaetze');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  function marker(index) {
    return screen.getAllByTestId('place-marker').find((element) => element.dataset.position === `${50 + index / 100},${8 + index / 100}`);
  }

  it('filtert auf einen Treffer', async () => {
    renderPlacesPage();
    await screen.findByRole('heading', { name: 'Bouleplatz 1' }, { timeout: 5_000 });

    fireEvent.click(within(marker(3)).getByRole('button', { name: 'Nur diesen Treffer' }));

    expect(screen.getByRole('heading', { name: 'Bouleplatz 3' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 1' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#place-3');

    fireEvent.click(screen.getByRole('button', { name: 'Entfernen: Bouleplatz 3' }));

    expect(screen.getByRole('heading', { name: 'Bouleplatz 1' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('lädt, öffnet und zeigt den Listeneintrag über „Details“', async () => {
    renderPlacesPage();
    await screen.findByRole('heading', { name: 'Bouleplatz 1' }, { timeout: 5_000 });
    expect(screen.queryByRole('heading', { name: 'Bouleplatz 14' })).not.toBeInTheDocument();

    fireEvent.click(within(marker(14)).getByRole('button', { name: 'Details' }));

    const details = screen.getByRole('heading', { name: 'Bouleplatz 14' }).closest('details');
    expect(details).toHaveAttribute('open');
    expect(Element.prototype.scrollIntoView.mock.contexts).toContain(details);
  });
});

