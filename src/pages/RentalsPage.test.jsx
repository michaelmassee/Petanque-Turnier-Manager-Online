import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, authenticatedApi } from '../lib/api.js';
import { RentalManagement, RentalOfferView } from './RentalsPage.jsx';

vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn(), authenticatedApi: vi.fn() }));

const OFFER = {
  id: 'o1', clubId: 'c1', clubName: 'BC Test', placeId: 'p1', placeName: 'Halle Nord', venueType: 'indoor', address: 'Berlin',
  title: 'Boulehalle', laneCount: 4, priceMinor: 1000, currency: 'EUR', priceNote: 'pro Bahn und Stunde',
  minHours: 1, maxHours: 3, bookingHorizonDays: 30, timezone: 'Europe/Berlin', status: 'active', canManage: false,
  openingHours: [{ weekday: 6, openHour: 9, closeHour: 13 }],
};
const slots = (frees) => frees.map((free, index) => ({ hour: 9 + index, free, bookable: true }));
const AVAILABILITY = {
  from: '2026-10-19', today: '2026-10-19',
  days: Array.from({ length: 7 }, (_, index) => {
    const date = `2026-10-${String(19 + index).padStart(2, '0')}`;
    return { date, weekday: (1 + index) % 7, slots: index === 5 ? slots([4, 2, 0, 4]) : [] };
  }),
};

describe('Platz mieten: Angebot und Kalender', () => {
  afterEach(() => vi.clearAllMocks());

  function mockOffer() {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: OFFER }));
  }

  it('zeigt freie Bahnen je Stunde und fragt eine Reservierung an', async () => {
    mockOffer();
    authenticatedApi.mockResolvedValue({ reservation: {} });
    render(<RentalOfferView id="o1" language="de" currentUser={{ id: 'u2' }} navigate={vi.fn()} onLogin={vi.fn()} />);

    const first = await screen.findByRole('button', { name: /09:00: 4 von 4 Bahnen frei/ });
    expect(screen.getByRole('button', { name: /11:00: 0 von 4 Bahnen frei/ })).toBeDisabled();
    fireEvent.click(first);

    const form = screen.getByRole('button', { name: 'Reservierung anfragen' }).closest('form');
    // Ab 09:00 sind zwei Stunden am Stück frei (11:00 ist ausgebucht).
    expect(within(form).getByLabelText('Dauer').querySelectorAll('option')).toHaveLength(2);
    fireEvent.change(within(form).getByLabelText('Dauer'), { target: { value: '2' } });
    expect(within(form).getByLabelText('Bahnen').querySelectorAll('option')).toHaveLength(2);
    fireEvent.change(within(form).getByLabelText('Bahnen'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reservierung anfragen' }));

    await waitFor(() => expect(authenticatedApi).toHaveBeenCalled());
    expect(authenticatedApi.mock.calls[0][0]).toBe('/api/rentals/o1/reservations');
    expect(JSON.parse(authenticatedApi.mock.calls[0][1].body)).toEqual({ date: '2026-10-24', startHour: 9, hours: 2, lanes: 2, note: '' });
    expect(await screen.findByText(/Anfrage gesendet/)).toBeInTheDocument();
  });

  it('nennt Spielort und Verein nur einmal, wenn sie gleich heißen, ohne Spielort-Präfix', async () => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, placeName: 'BC Test' } }));
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);
    expect(await screen.findByText('BC Test · 4 Bahn(en)')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toHaveClass('rental-offer-address');
    expect(screen.queryByText(/Boulehalle:/)).not.toBeInTheDocument();
  });

  it('bittet Gäste ums Anmelden statt das Formular zu zeigen', async () => {
    mockOffer();
    const onLogin = vi.fn();
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={onLogin} />);
    fireEvent.click(await screen.findByRole('button', { name: /09:00: 4 von 4 Bahnen frei/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(onLogin).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reservierung anfragen' })).not.toBeInTheDocument();
  });
});

describe('Platz mieten: Vereinsverwaltung', () => {
  afterEach(() => vi.clearAllMocks());

  const MANAGE = {
    offers: [OFFER],
    places: [{ id: 'p1', name: 'Halle Nord', courtCount: 6, venueType: 'indoor', status: 'published' }],
    reservations: [{ id: 'r1', offerId: 'o1', date: '2026-10-24', startHour: 9, hours: 2, lanes: 2, status: 'requested', renterName: 'Max Mieter', renterEmail: 'max@example.test', note: 'Training' }],
  };

  function mockManagement(onWrite = async () => ({})) {
    authenticatedApi.mockImplementation(async (path, options) => {
      if (options?.method) return onWrite(path, options);
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true }] };
      return MANAGE;
    });
  }

  it('bestätigt eine offene Anfrage mit Nachricht', async () => {
    const onWrite = vi.fn(async () => ({}));
    mockManagement(onWrite);
    render(<RentalManagement language="de" navigate={vi.fn()} />);

    expect(await screen.findByText(/Max Mieter/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Nachricht an den Mieter/), { target: { value: 'Bis Samstag' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bestätigen' }));

    await waitFor(() => expect(onWrite).toHaveBeenCalled());
    expect(onWrite.mock.calls[0][0]).toBe('/api/rentals/reservations/r1/decision');
    expect(JSON.parse(onWrite.mock.calls[0][1].body)).toEqual({ decision: 'confirm', note: 'Bis Samstag' });
    expect(await screen.findByText('Der Mieter wurde benachrichtigt.')).toBeInTheDocument();
  });

  it('bietet Admins alle Vereine an, die eigenen zuerst', async () => {
    authenticatedApi.mockImplementation(async (path) => {
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true }] };
      if (path === '/api/admin/clubs') return { clubs: [{ id: 'c1', name: 'BC Test', status: 'published', placeCount: 1 }, { id: 'c2', name: 'Anderer Club', status: 'pending', placeCount: 2 }] };
      return MANAGE;
    });
    render(<RentalManagement language="de" navigate={vi.fn()} currentUser={{ id: 'admin', role: 'admin' }} />);

    const input = await screen.findByRole('combobox', { name: 'Verein' });
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledWith('/api/rentals/manage?club=c1'));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Anderer' } });
    fireEvent.click(await screen.findByRole('option', { name: /Anderer Club/ }));
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledWith('/api/rentals/manage?club=c2'));
  });

  it('legt ein Angebot mit Öffnungszeiten an', async () => {
    const onWrite = vi.fn(async () => ({}));
    mockManagement(onWrite);
    render(<RentalManagement language="de" navigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Neues Angebot' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/Anzahl Bahnen/)).toHaveValue(6);
    fireEvent.change(within(dialog).getByLabelText(/Titel/), { target: { value: 'Halle abends' } });
    fireEvent.change(within(dialog).getByLabelText('Preis'), { target: { value: '7,50' } });
    fireEvent.click(within(dialog).getAllByRole('checkbox')[0]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onWrite).toHaveBeenCalled());
    expect(onWrite.mock.calls[0][0]).toBe('/api/rentals/offers');
    expect(JSON.parse(onWrite.mock.calls[0][1].body)).toMatchObject({
      clubId: 'c1', placeId: 'p1', title: 'Halle abends', laneCount: 6, priceMinor: 750,
      openingHours: [{ weekday: 1, openHour: 10, closeHour: 20 }],
    });
  });
});
