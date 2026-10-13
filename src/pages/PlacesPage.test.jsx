import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlacesPage, { filterPlaces, groupMapPlaces, groupPlacesByOrganization } from './PlacesPage.jsx';
import '../lib/i18next-config.js';

const map = vi.hoisted(() => ({ flyTo: vi.fn(), getZoom: vi.fn(() => 12), openPopup: vi.fn() }));

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
}));

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
