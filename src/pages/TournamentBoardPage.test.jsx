import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentBoardPage from './TournamentBoardPage.jsx';
import { FakeWebSocket, installFakeWebSocket, latestSocket, uninstallFakeWebSocket } from '../test-support/fake-websocket.js';

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

function tournamentWith(overrides) {
  return {
    id: 't1', name: 'Herbstturnier', date: '2099-06-01', type: 'schweizer', visibility: 'public', participantsPublic: true,
    registrationEnabled: true, status: 'running', location: 'Parkweg 1, Linden', ...overrides,
  };
}

function renderBoard(tournament) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(
    <QueryClientProvider client={client}>
      <TournamentBoardPage tournamentId={tournament.id} tournaments={[tournament]} language="de" />
    </QueryClientProvider>,
  ) };
}

describe('Turnierseite', () => {
  afterEach(() => vi.restoreAllMocks());

  it('zeigt Ankündigung und Spielplan eines laufenden Turniers ohne Reiter', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: { text: 'Mittagspause bis 13 Uhr', at: '2099-06-01T11:00:00.000Z' },
    })));

    renderBoard(tournamentWith({}));

    expect(screen.getByRole('heading', { name: 'Herbstturnier' })).toBeInTheDocument();
    expect(await screen.findByText('Noch keine Runde gestartet.')).toBeInTheDocument();
    expect(await screen.findByText('Mittagspause bis 13 Uhr')).toBeInTheDocument();
    expect(await screen.findByText(/^nächste Aktualisierung in [12]:\d\d$/)).toBeInTheDocument();
    // PTM-Logo unten rechts in der Aktualisierungszeile.
    expect(screen.getByRole('img', { name: 'Pétanque Turnier Manager Online' }).closest('.live-refresh')).not.toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/schedule', expect.anything());
    expect(screen.queryByRole('navigation', { name: 'Turnierdetails' })).not.toBeInTheDocument();
  });

  it('zeigt als reine Anzeige (auch für einen Bildschirm vor Ort) weder Menü noch Bedienelemente', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: { text: 'Mittagspause bis 13 Uhr', at: '2099-06-01T11:00:00.000Z' },
    })));

    const { container } = renderBoard(tournamentWith({}));

    expect(screen.getByRole('heading', { name: 'Herbstturnier' })).toBeInTheDocument();
    expect(await screen.findByText('Mittagspause bis 13 Uhr')).toBeInTheDocument();
    expect(container.querySelector('.topbar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bereiche öffnen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turnierdetails' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aktualisieren' })).not.toBeInTheDocument();
  });

  it('zeigt das Vereinslogo vor dem Verein und ohne Uhrzeit nur das Datum', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    renderBoard(tournamentWith({ club: 'BC Linden', logoUrl: 'https://example.test/logo.png', startTime: null }));

    const club = document.querySelector('.tournament-detail-club');
    expect(club.querySelector('img.tournament-detail-club-logo')).toHaveAttribute('src', '/api/tournaments/t1/image?field=logo');
    expect(club).toHaveTextContent('BC Linden');
    expect(document.querySelector('.tournament-detail-meta')).not.toHaveTextContent('Ganztägig');
    await screen.findByText('Noch keine Runde gestartet.');
  });

  it('zeigt die Uhrzeit, wenn das Turnier eine hat', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    renderBoard(tournamentWith({ startTime: '10:00', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    expect(document.querySelector('.tournament-detail-meta')).toHaveTextContent(/2099 10:00/);
    await screen.findByText('Noch keine Runde gestartet.');
  });

  it('reicht bei privaten Turnieren den Freigabe-Token an den Spielplan weiter', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    window.history.replaceState({}, '', '/turnierseite/t1?share=geheim');
    try {
      renderBoard(tournamentWith({ visibility: 'private' }));
      await screen.findByText('Noch keine Runde gestartet.');
      expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/schedule?share=geheim', expect.anything());
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('weist vor dem Start darauf hin und schaltet auf den Spielplan um, sobald das Turnier läuft', async () => {
    // Die Turnierliste der App kennt noch den Status vom Laden; der Spielplan-Abruf meldet den Start.
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'registration', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    const { unmount } = renderBoard(tournamentWith({ status: 'registration' }));
    expect(await screen.findByText(/hat noch nicht begonnen/)).toBeInTheDocument();
    expect(await screen.findByText(/^nächste Aktualisierung in [12]:\d\d$/)).toBeInTheDocument();
    unmount();

    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    renderBoard(tournamentWith({ status: 'registration' }));
    expect(await screen.findByText('Noch keine Runde gestartet.')).toBeInTheDocument();
    expect(screen.queryByText(/hat noch nicht begonnen/)).not.toBeInTheDocument();
  });

  it.each(['registration', 'running'])('zeigt bis zur ersten Runde Meldeliste, Teammitglieder und Check-in-Status (%s)', async (status) => {
    const person = (firstName) => ({ firstName, lastName: 'Muster', club: 'BC Linden', accountConnected: firstName === 'Anna' });
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status, rounds: [], ranking: [], entries: [
      { status: 'confirmed', participation: 'active', teamName: 'Team Eins', persons: [person('Anna'), person('Bert')] },
      { status: 'confirmed', participation: 'inactive', persons: [person('Clara')] },
      { status: 'confirmed', participation: 'withdrawn', persons: [person('Dirk')] },
      { status: 'pending', participation: null, persons: [person('Eva')] },
      { status: 'waitlist', participation: null, persons: [person('Finn')] },
    ] })));
    renderBoard(tournamentWith({ status }));
    const list = await screen.findByRole('region', { name: 'Meldeliste' });
    for (const name of ['Anna', 'Bert', 'Clara', 'Dirk', 'Eva', 'Finn']) expect(within(list).getByText(`${name} Muster`)).toBeInTheDocument();
    expect(within(list).getByText('Team Eins')).toBeInTheDocument();
    expect(within(list).getByLabelText('Check-in: Eingecheckt.')).toBeInTheDocument();
    expect(within(list).getByLabelText('Check-in: Noch nicht eingecheckt.')).toBeInTheDocument();
    expect(within(list).getByLabelText('Check-in: Ausgesetzt')).toBeInTheDocument();
    expect(within(list).getByLabelText('Mit Benutzerkonto verbunden')).toBeInTheDocument();
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/schedule', expect.anything());
  });

  it('aktualisiert Check-in über den Spielplan-Abruf und wechselt bei der ersten Runde automatisch zum Spielplan', async () => {
    const entry = { status: 'confirmed', participation: 'inactive', persons: [{ firstName: 'Anna', lastName: 'Muster' }] };
    let data = { status: 'registration', rounds: [], ranking: [], entries: [entry] };
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(data)));
    const { client } = renderBoard(tournamentWith({ status: 'registration' }));
    await screen.findByLabelText('Check-in: Noch nicht eingecheckt.');
    data = { ...data, entries: [{ ...entry, participation: 'active' }] };
    await act(() => client.invalidateQueries({ queryKey: ['schedule', 't1', ''] }));
    expect(await screen.findByLabelText('Check-in: Eingecheckt.')).toBeInTheDocument();
    data = { status: 'running', rounds: [{ id: 'r1', roundNumber: 1, matches: [] }], ranking: [] };
    await act(() => client.invalidateQueries({ queryKey: ['schedule', 't1', ''] }));
    expect(await screen.findByRole('heading', { name: 'Runde 1' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Meldeliste' })).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('öffnet für die Anzeige genau einen WebSocket und lädt pro Änderung einmal', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    installFakeWebSocket();
    try {
      renderBoard(tournamentWith({}));
      await screen.findByText('Noch keine Runde gestartet.');
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      expect(FakeWebSocket.instances).toHaveLength(1);
      // Kein Benachrichtigungs-Schalter mehr: Die Seite aktualisiert sich ohne Erlaubnis.
      expect(screen.queryByRole('button', { name: /Push/ })).not.toBeInTheDocument();

      act(() => { latestSocket().open(); latestSocket().receive({ type: 'changed' }); });
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 3000 });
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      uninstallFakeWebSocket();
    }
  });

  it('lädt bei nicht öffentlicher Teilnehmerliste keinen Spielplan', () => {
    global.fetch = vi.fn();
    renderBoard(tournamentWith({ participantsPublic: false }));
    expect(screen.getByText('Für dieses Turnier gibt es keinen öffentlichen Spielplan.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
