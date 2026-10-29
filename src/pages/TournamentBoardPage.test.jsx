import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TournamentBoardPage from './TournamentBoardPage.jsx';

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
  return render(
    <QueryClientProvider client={client}>
      <TournamentBoardPage tournamentId={tournament.id} tournaments={[tournament]} language="de" />
    </QueryClientProvider>,
  );
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

  it('lädt bei einem Live-Push den Spielplan nur einmal, obwohl Seite und Spielplan beide zuhören', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: null })));
    const serviceWorker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });
    try {
      renderBoard(tournamentWith({}));
      await screen.findByText('Noch keine Runde gestartet.');
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

      serviceWorker.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'live-update', tournamentId: 't1' } }));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      delete navigator.serviceWorker;
    }
  });

  it('lädt bei nicht öffentlicher Teilnehmerliste keinen Spielplan', () => {
    global.fetch = vi.fn();
    renderBoard(tournamentWith({ participantsPublic: false }));
    expect(screen.getByText('Für dieses Turnier gibt es keinen öffentlichen Spielplan.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
