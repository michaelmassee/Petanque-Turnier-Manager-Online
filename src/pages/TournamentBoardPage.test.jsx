import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      <TournamentBoardPage tournamentId={tournament.id} tournaments={[tournament]} currentUser={null} language="de"
        setLanguage={() => {}} navigate={() => {}} menuOpen={false} setMenuOpen={() => {}} />
    </QueryClientProvider>,
  );
}

describe('Turnierseite im Vollformat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('zeigt Ankündigung und Spielplan eines laufenden Turniers ohne Reiter', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      status: 'running', rounds: [], ranking: [], dataAsOf: null, announcement: { text: 'Mittagspause bis 13 Uhr', at: '2099-06-01T11:00:00.000Z' },
    })));

    renderBoard(tournamentWith({}));

    expect(screen.getByRole('heading', { name: 'Herbstturnier' })).toBeInTheDocument();
    expect(await screen.findByText('Noch keine Runde gestartet.')).toBeInTheDocument();
    expect(await screen.findByText('Mittagspause bis 13 Uhr')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/t1/schedule', expect.anything());
    expect(screen.queryByRole('navigation', { name: 'Turnierdetails' })).not.toBeInTheDocument();
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

  it('weist vor dem Start und bei nicht öffentlicher Teilnehmerliste darauf hin, statt den Spielplan zu laden', () => {
    global.fetch = vi.fn();
    const { unmount } = renderBoard(tournamentWith({ status: 'registration' }));
    expect(screen.getByText(/hat noch nicht begonnen/)).toBeInTheDocument();
    unmount();

    renderBoard(tournamentWith({ participantsPublic: false }));
    expect(screen.getByText('Für dieses Turnier gibt es keinen öffentlichen Spielplan.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
