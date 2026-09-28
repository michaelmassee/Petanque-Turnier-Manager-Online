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

  it('öffnet für eigene Suche ein mit dem Turnier vorbelegtes Gesuch', async () => {
    stubListings([]);
    const navigate = vi.fn();

    render(<TournamentPlayerListings tournament={tournament} currentUser={{ id: 'u-1' }} navigate={navigate} />);
    await screen.findByText('Zu diesem Turnier gibt es noch keine Mitspielgesuche.');
    fireEvent.click(screen.getByRole('button', { name: 'Mitspieler für dieses Turnier suchen' }));

    expect(navigate).toHaveBeenCalledWith('/meine-anzeigen?turnier=t-1');
  });

  it('zeigt Gästen die Gesuche ohne Antwort- oder Erstellmöglichkeit', async () => {
    stubListings([{ id: 'l-1', title: 'Suche Leger', playingPosition: 'leger' }]);

    render(<TournamentPlayerListings tournament={tournament} currentUser={null} navigate={vi.fn()} />);

    expect(await screen.findByText('Suche Leger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nachricht senden' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mitspieler für dieses Turnier suchen' })).not.toBeInTheDocument();
    expect(screen.getByText('Melde dich an, um ein Mitspielgesuch zu erstellen oder zu antworten.')).toBeInTheDocument();
  });

  it('klappt eine Anzeige per Klick mit Beschreibung und Kontakt-Button auf', async () => {
    stubListings([{ id: 'l-1', title: 'Suche Schießer', playingPosition: 'schiesser', userId: 'u-2', ownerName: 'Anna B', type: 'tournament', description: 'Bin Legerin und suche für das Doublette einen Schießer.', locationName: 'Boulodrome Nord', eventDate: '2099-05-01' }]);

    render(<TournamentPlayerListings tournament={tournament} currentUser={{ id: 'u-1' }} navigate={vi.fn()} />);
    const toggle = await screen.findByRole('button', { name: /Suche Schießer/ });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/suche für das Doublette/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/suche für das Doublette/)).toBeInTheDocument();
    expect(screen.getByText(/Boulodrome Nord · 1\.5\.2099/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nachricht senden' })).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/suche für das Doublette/)).not.toBeInTheDocument();
  });

  it('führt bei der eigenen Anzeige direkt zum Bearbeiten', async () => {
    stubListings([{ id: 'l-9', title: 'Mein Gesuch', playingPosition: 'egal', userId: 'u-1', ownerName: 'Ich Selbst', type: 'tournament' }]);
    const navigate = vi.fn();

    render(<TournamentPlayerListings tournament={tournament} currentUser={{ id: 'u-1' }} navigate={navigate} />);
    fireEvent.click(await screen.findByRole('button', { name: /Mein Gesuch/ }));

    expect(screen.queryByRole('button', { name: 'Nachricht senden' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(navigate).toHaveBeenCalledWith('/meine-anzeigen?bearbeiten=l-9');
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
