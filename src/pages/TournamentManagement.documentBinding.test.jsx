// Ein Turnierdokument kann sich verbinden, während die Turnierverwaltung offen ist. Die Liste muss das beim
// Zurückkehren ins Fenster und spätestens beim Bearbeiten erkennen, sonst fehlt der Trennen-Knopf.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentManagementPage } from './TournamentManagement.jsx';

const jsonResponse = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

const tournament = {
  id: 't1', name: 'Testturnier', date: '2099-07-01', location: 'Ort', formation: 'doublette', status: 'draft',
  visibility: 'public', ownerId: 'u1', canManage: true, editors: [], documentManaged: false,
};
const currentUser = { id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user' };

function renderPage({ boundOnServer, onTournamentsChanged = () => {}, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }) }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
    if (path === '/api/tournaments/t1') return jsonResponse({ tournament: { ...tournament, documentManaged: boundOnServer } });
    return jsonResponse({});
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TournamentManagementPage tournaments={[tournament]} currentUser={currentUser} language="de"
        setSelectedTournamentId={() => {}} onTournamentsChanged={onTournamentsChanged} />
    </QueryClientProvider>,
  );
}

describe('Turnierverwaltung: inzwischen verbundenes Turnierdokument', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('öffnet kein Formular, wenn das Turnier inzwischen im Turnierdokument geführt wird, und lädt die Liste neu', async () => {
    const onTournamentsChanged = vi.fn();
    renderPage({ boundOnServer: true, onTournamentsChanged });

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    expect(await screen.findByText(/wird inzwischen im Turnierdokument geführt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turnier speichern' })).not.toBeInTheDocument();
    expect(onTournamentsChanged).toHaveBeenCalledTimes(1);
  });

  it('öffnet das Formular, wenn das Turnier weiterhin nicht gebunden ist', async () => {
    const onTournamentsChanged = vi.fn();
    renderPage({ boundOnServer: false, onTournamentsChanged });

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    expect(await screen.findByRole('button', { name: 'Turnier speichern' })).toBeInTheDocument();
    expect(onTournamentsChanged).not.toHaveBeenCalled();
  });

  it('zeigt ein gebundenes Turnier mit Badge "Eckdaten im Turnierdokument" bei den Status-Badges', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({}));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TournamentManagementPage tournaments={[{ ...tournament, documentManaged: true }]} currentUser={currentUser}
          language="de" setSelectedTournamentId={() => {}} onTournamentsChanged={() => {}} />
      </QueryClientProvider>,
    );

    const badge = screen.getByText('Eckdaten im Turnierdokument');
    expect(badge).toHaveClass('role');
    expect(badge.closest('.badges')).not.toBeNull();
  });

  it('lädt die veraltete Turnierliste beim Fensterfokus neu, eine frische nicht', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    const loadList = vi.fn(async () => ({ tournaments: [] }));
    function TournamentListQuery() {
      useQuery({ queryKey: ['tournaments'], queryFn: loadList });
      return null;
    }
    render(<QueryClientProvider client={queryClient}><TournamentListQuery /></QueryClientProvider>);
    renderPage({ boundOnServer: false, queryClient });
    await vi.waitFor(() => expect(loadList).toHaveBeenCalledTimes(1));

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(loadList).toHaveBeenCalledTimes(1);

    await act(async () => queryClient.invalidateQueries({ queryKey: ['tournaments'], refetchType: 'none' }));
    await act(async () => window.dispatchEvent(new Event('focus')));
    await vi.waitFor(() => expect(loadList).toHaveBeenCalledTimes(2));
  });
});
