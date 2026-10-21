import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, authenticatedApi } from '../lib/api.js';
import { MyRentalReservations, RentalManagement, RentalOfferView, RentalsPage } from './RentalsPage.jsx';

vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn(), authenticatedApi: vi.fn() }));

const OFFER = {
  id: 'o1', clubId: 'c1', clubName: 'BC Test', placeId: 'p1', placeName: 'Halle Nord', venueType: 'indoor', address: 'Berlin',
  title: 'Boulehalle', laneCount: 4, priceMinor: 1000, currency: 'EUR', priceNote: 'pro Bahn und Stunde',
  minHours: 1, maxHours: 3, bookingHorizonDays: 30, timezone: 'Europe/Berlin', status: 'active', isPublic: true, canManage: false,
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

describe('Mietangebote teilen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderOffer(offer = OFFER) {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer }));
    return render(<RentalOfferView id={offer.id} language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);
  }

  it('teilt aus der Liste den Namen und direkten Kalenderlink ohne zusätzliche Abfrage', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    api.mockResolvedValue({ offers: [OFFER] });
    render(<RentalsPage route={{ view: 'list' }} language="de" navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teilen' }));
    expect(share).toHaveBeenCalledWith({ title: OFFER.title, text: OFFER.title, url: `${window.location.origin}/platz-mieten/o1` });
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('kopiert Name und URL, wenn Geräte-Teilen fehlt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderOffer({ ...OFFER, id: 'offer /1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Teilen' }));
    expect(writeText).toHaveBeenCalledWith(`${OFFER.title}\n${window.location.origin}/platz-mieten/offer%20%2F1`);
    expect(await screen.findByText('Link kopiert')).toBeInTheDocument();
  });

  it('zeigt einen abgebrochenen Teilen-Dialog ohne Fehlermeldung', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Abgebrochen', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    renderOffer();
    fireEvent.click(await screen.findByRole('button', { name: 'Teilen' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText('Teilen wird von diesem Gerät nicht unterstützt')).not.toBeInTheDocument();
    expect(screen.queryByText('Link kopiert')).not.toBeInTheDocument();
  });

  it('meldet Fehler beim Kopieren', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) } });
    renderOffer();
    fireEvent.click(await screen.findByRole('button', { name: 'Teilen' }));
    expect(await screen.findByText('Teilen wird von diesem Gerät nicht unterstützt')).toBeInTheDocument();
  });

  it('bietet bei nicht öffentlichen Angeboten keinen Teilen-Button an', async () => {
    renderOffer({ ...OFFER, isPublic: false, canManage: true });
    await screen.findByRole('heading', { name: OFFER.title });
    expect(screen.queryByRole('button', { name: 'Teilen' })).not.toBeInTheDocument();
  });
});

describe('Reservierung aus der Zusagemail', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('fokussiert Stornieren, ohne beim Öffnen der Mail automatisch abzusagen', async () => {
    window.history.replaceState({}, '', '/platz-mieten/meine#stornieren-r1');
    const reservation = { id: 'r1', offerId: 'o1', offerTitle: 'Boulehalle', date: '2099-10-24', startHour: 10, hours: 2, lanes: 2, status: 'confirmed', startUtc: '2099-10-24T08:00:00.000Z' };
    authenticatedApi.mockResolvedValue({ reservations: [reservation] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MyRentalReservations language="de" navigate={vi.fn()} />);
    const button = await screen.findByRole('button', { name: 'Stornieren' });
    await waitFor(() => expect(button).toHaveFocus());
    expect(confirm).not.toHaveBeenCalled();
    expect(authenticatedApi).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith('Reservierung wirklich stornieren?');
    expect(authenticatedApi).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(button).toBeEnabled());
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledWith('/api/rentals/reservations/r1/cancel', { method: 'POST' }));
    expect(await screen.findByText('Reservierung storniert.')).toBeInTheDocument();
  });
});

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
    expect((await screen.findByText('BC Test')).closest('span')).toHaveTextContent(/^BC Test · 4 Bahn\(en\)$/);
    expect(screen.getByText('Berlin')).toHaveClass('rental-offer-address');
    expect(screen.queryByText(/Boulehalle:/)).not.toBeInTheDocument();
  });

  it('zeigt „Preis auf Anfrage“, wenn kein Preis hinterlegt ist', async () => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, priceMinor: null } }));
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);
    expect(await screen.findByText('Preis auf Anfrage')).toBeInTheDocument();
  });

  it('zeigt die Beschreibung formatiert als Rich Text', async () => {
    const description = `ptm-richtext:v1:${JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mit Bar', marks: [{ type: 'bold' }] }] }] })}`;
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, description } }));
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);
    expect((await screen.findByText('Mit Bar')).closest('strong')).not.toBeNull();
  });

  it('springt über den Monatskalender zu einem Tag und sperrt nicht buchbare Tage', async () => {
    const MONTH = {
      month: '2026-10', today: '2026-10-19', lastDate: '2026-11-18',
      days: Array.from({ length: 31 }, (_, index) => {
        const date = `2026-10-${String(index + 1).padStart(2, '0')}`;
        const status = index < 18 ? 'unavailable' : { 19: 'closed', 23: 'partial', 30: 'full' }[index] || 'free';
        return { date, status };
      }),
    };
    api.mockImplementation(async (path) => {
      if (path.includes('month=')) return MONTH;
      return path.includes('/availability') ? AVAILABILITY : { offer: OFFER };
    });
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Datum wählen: / }));
    expect(await screen.findByText('Oktober 2026')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/api/rentals/o1/availability?month=2026-10');
    expect(screen.getByRole('button', { name: 'Vorheriger Monat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Montag, 12. Oktober 2026: nicht buchbar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dienstag, 20. Oktober 2026: geschlossen' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Samstag, 24. Oktober 2026: teilweise belegt' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/rentals/o1/availability?from=2026-10-24'));
    expect(screen.queryByText('Oktober 2026')).not.toBeInTheDocument();
  });

  it('öffnet über den Spielort die Karte unter Plätze & Vereine, gefiltert auf diesen Platz', async () => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, isPublic: true } }));
    const navigate = vi.fn();
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={navigate} onLogin={vi.fn()} />);
    const link = await screen.findByRole('link', { name: 'Halle Nord' });
    expect(link).toHaveAttribute('href', '/plaetze#p1');
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/plaetze#p1');
  });

  it('verlinkt den Spielort nicht, solange das Angebot nicht öffentlich ist', async () => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, isPublic: false } }));
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);
    expect(await screen.findByText(/Halle Nord/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Halle Nord' })).not.toBeInTheDocument();
  });

  it('schickt angemeldet eine Nachricht an den Vermieter', async () => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, isPublic: true } }));
    authenticatedApi.mockResolvedValue({ ok: true });
    render(<RentalOfferView id="o1" language="de" currentUser={{ id: 'u2' }} navigate={vi.fn()} onLogin={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Nachricht an Vermieter' }));
    const dialog = screen.getByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'Senden' });
    expect(send).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Habt ihr Flutlicht?' } });
    fireEvent.click(send);
    expect(await screen.findByText(/Nachricht gesendet/)).toBeInTheDocument();
    expect(authenticatedApi).toHaveBeenCalledWith('/api/rentals/o1/messages', { method: 'POST', body: JSON.stringify({ body: 'Habt ihr Flutlicht?' }) });
  });

  it('öffnet mit Kontakt-E-Mail des Vereins das E-Mail-Programm, auch für Gäste', async () => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, isPublic: true, clubContactEmail: 'info@bc-test.de' } }));
    render(<RentalOfferView id="o1" language="de" currentUser={null} navigate={vi.fn()} onLogin={vi.fn()} />);
    const link = await screen.findByRole('link', { name: 'Nachricht an Vermieter' });
    expect(link).toHaveAttribute('href', `mailto:info%40bc-test.de?subject=${encodeURIComponent(OFFER.title)}`);
    expect(screen.queryByRole('button', { name: 'Nachricht an Vermieter' })).not.toBeInTheDocument();
  });

  it.each([
    ['Gäste', null, {}],
    ['Vereinsverwalter', { id: 'u1' }, { canManage: true }],
  ])('bietet %s keine Nachricht an den Vermieter an', async (_label, currentUser, patch) => {
    api.mockImplementation(async (path) => (path.includes('/availability') ? AVAILABILITY : { offer: { ...OFFER, isPublic: true, ...patch } }));
    render(<RentalOfferView id="o1" language="de" currentUser={currentUser} navigate={vi.fn()} onLogin={vi.fn()} />);
    expect(await screen.findByText('Boulehalle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nachricht an Vermieter' })).not.toBeInTheDocument();
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
    clubStatus: 'published',
    offers: [OFFER],
    places: [{ id: 'p1', name: 'Halle Nord', courtCount: 6, venueType: 'indoor', status: 'published' }],
    reservations: [{ id: 'r1', offerId: 'o1', date: '2026-10-24', startHour: 9, hours: 2, lanes: 2, status: 'requested', renterName: 'Max Mieter', renterEmail: 'max@example.test', note: 'Training' }],
  };

  function mockManagement(onWrite = async () => ({})) {
    authenticatedApi.mockImplementation(async (path, options) => {
      if (options?.method) return onWrite(path, options);
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true, status: 'published' }] };
      return MANAGE;
    });
  }

  it('bietet Teilen in der Verwaltung nur für öffentliche Angebote an', async () => {
    authenticatedApi.mockImplementation(async (path) => {
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true, status: 'published' }] };
      return { ...MANAGE, offers: [OFFER, { ...OFFER, id: 'paused', title: 'Pausiertes Angebot', status: 'paused', isPublic: false }] };
    });
    render(<RentalManagement language="de" navigate={vi.fn()} />);
    const publicRow = (await screen.findByText(OFFER.title)).closest('article');
    expect(within(publicRow).getByRole('button', { name: 'Teilen' })).toBeInTheDocument();
    const pausedRow = screen.getByText('Pausiertes Angebot').closest('article');
    expect(within(pausedRow).queryByRole('button', { name: 'Teilen' })).not.toBeInTheDocument();
  });

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
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true, status: 'published' }] };
      if (path === '/api/admin/clubs') return { clubs: [{ id: 'c1', name: 'BC Test', status: 'published', placeCount: 1 }, { id: 'c2', name: 'Anderer Club', status: 'published', placeCount: 2 }, { id: 'c3', name: 'Anderer Neuling', status: 'pending', placeCount: 1 }] };
      return MANAGE;
    });
    render(<RentalManagement language="de" navigate={vi.fn()} currentUser={{ id: 'admin', role: 'admin' }} />);

    const input = await screen.findByRole('combobox', { name: 'Verein' });
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledWith('/api/rentals/manage?club=c1'));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Anderer' } });
    expect(await screen.findByRole('option', { name: /Anderer Club/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Anderer Neuling/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Anderer Club/ }));
    await waitFor(() => expect(authenticatedApi).toHaveBeenCalledWith('/api/rentals/manage?club=c2'));
  });

  it('bietet im Angebotsformular den Rich-Text-Editor für die Beschreibung an', async () => {
    mockManagement(vi.fn(async () => ({})));
    render(<RentalManagement language="de" navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Neues Angebot' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fett' })).toBeInTheDocument();
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

  it('sperrt Angebote, wenn der Verein keinen Spielort hat', async () => {
    authenticatedApi.mockImplementation(async (path) => {
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true, status: 'published' }] };
      return { ...MANAGE, places: [] };
    });
    render(<RentalManagement language="de" navigate={vi.fn()} />);

    expect(await screen.findByText(/Dein Verein hat noch keinen Spielort/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neues Angebot' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
  });

  it('sperrt neue Angebote, solange der Verein nicht freigegeben ist', async () => {
    authenticatedApi.mockImplementation(async (path) => {
      if (path === '/api/clubs/mine') return { clubs: [{ id: 'c1', name: 'BC Test', canEdit: true, status: 'published' }] };
      return { ...MANAGE, clubStatus: 'pending' };
    });
    render(<RentalManagement language="de" navigate={vi.fn()} />);

    expect(await screen.findByText(/Dein Verein ist noch nicht freigegeben/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neues Angebot' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
  });
});
