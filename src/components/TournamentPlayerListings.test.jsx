import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentPlayerListings } from './TournamentPlayerListings.jsx';
import { applyTournamentToListingForm } from './PlayerListingFields.jsx';
import '../lib/i18next-config.js';

const tournament = { id: 't-1', name: 'Frühjahrs-Cup', date: '2099-05-01', location: 'Boulodrome Nord', latitude: 51.2, longitude: 6.8 };

function stubListings(listings) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ listings }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Mitspielgesuche auf der Turnierseite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lädt nur die Gesuche dieses Turniers und zeigt deren Anzahl', async () => {
    const fetchMock = stubListings([{ id: 'l-1', title: 'Suche Schießer', playingPosition: 'schiesser', userId: 'u-2', ownerName: 'Anna B' }]);

    render(<TournamentPlayerListings tournament={tournament} currentUser={{ id: 'u-1' }} navigate={vi.fn()} />);

    expect(await screen.findByText('Suche Schießer')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain('tournamentId=t-1');
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('öffnet eine Anzeige per Klick im Boule-Treff', async () => {
    stubListings([{ id: 'l-1', title: 'Suche Schießer', playingPosition: 'schiesser', userId: 'u-2', ownerName: 'Anna B' }]);
    const navigate = vi.fn();

    render(<TournamentPlayerListings tournament={tournament} currentUser={null} navigate={navigate} />);
    fireEvent.click(await screen.findByRole('button', { name: /Suche Schießer/ }));

    expect(navigate).toHaveBeenCalledWith('/spielerboerse?anzeige=l-1');
  });

  it('öffnet für eigene Suche ein mit dem Turnier vorbelegtes Gesuch', async () => {
    stubListings([]);
    const navigate = vi.fn();

    render(<TournamentPlayerListings tournament={tournament} currentUser={{ id: 'u-1' }} navigate={navigate} />);
    await screen.findByText('Zu diesem Turnier gibt es noch keine Mitspielgesuche.');
    fireEvent.click(screen.getByRole('button', { name: 'Mitspieler für dieses Turnier suchen' }));

    expect(navigate).toHaveBeenCalledWith('/meine-anzeigen?turnier=t-1');
  });

  it('lässt angemeldete Nutzer Push-Hinweise für neue Gesuche ein- und ausschalten', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => new Response(JSON.stringify(
      String(url).includes('player-listing-notification')
        ? { enabled: options.method === 'PUT' }
        : { listings: [] },
    ), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    render(<TournamentPlayerListings tournament={tournament} currentUser={{ id: 'u-1' }} navigate={vi.fn()} />);

    const option = await screen.findByRole('checkbox', { name: 'Bei neuen Mitspielgesuchen benachrichtigen' });
    expect(option).not.toBeChecked();
    fireEvent.click(option);
    await screen.findByRole('checkbox', { name: 'Bei neuen Mitspielgesuchen benachrichtigen', checked: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tournaments/t-1/player-listing-notification',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: true }) }),
    );
  });

  it('zeigt Gästen die Gesuche ohne Antwort- oder Erstellmöglichkeit', async () => {
    stubListings([{ id: 'l-1', title: 'Suche Leger', playingPosition: 'leger' }]);

    render(<TournamentPlayerListings tournament={tournament} currentUser={null} navigate={vi.fn()} />);

    expect(await screen.findByText('Suche Leger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nachricht senden' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mitspieler für dieses Turnier suchen' })).not.toBeInTheDocument();
    expect(screen.getByText('Melde dich an, um ein Mitspielgesuch zu erstellen oder zu antworten.')).toBeInTheDocument();
  });
});

describe('applyTournamentToListingForm', () => {
  const emptyForm = { type: 'training', title: '', eventDate: '', locationName: '', latitude: null, longitude: null, locationConfirmed: false, venueId: 'v-1', tournamentId: '' };

  it('übernimmt Datum, Ort und Titel aus dem Turnier', () => {
    expect(applyTournamentToListingForm(emptyForm, tournament)).toMatchObject({
      type: 'tournament', tournamentId: 't-1', title: 'Frühjahrs-Cup', eventDate: '2099-05-01',
      locationName: 'Boulodrome Nord', latitude: 51.2, longitude: 6.8, locationConfirmed: true, venueId: '',
    });
  });

  it('behält einen bereits eingegebenen Titel', () => {
    expect(applyTournamentToListingForm({ ...emptyForm, title: 'Eigener Titel' }, tournament).title).toBe('Eigener Titel');
  });

  it('entfernt nur die Verknüpfung, wenn kein Turnier gewählt ist', () => {
    expect(applyTournamentToListingForm({ ...emptyForm, tournamentId: 't-1' }, undefined)).toMatchObject({ tournamentId: '', venueId: 'v-1' });
  });
});
