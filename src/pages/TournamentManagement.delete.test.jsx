// Löschen eines Turniers, das schon weg ist (erster Versuch lief in die Zeitüberschreitung, kam aber an): Der Server
// meldet 404, die Liste muss trotzdem neu geladen werden, statt das Turnier mit „Turnier nicht gefunden“ stehen zu lassen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentManagementPage } from './TournamentManagement.jsx';

const tournament = {
  id: 't1', name: 'Testturnier', date: '2099-07-01', location: 'Ort', formation: 'doublette', status: 'running',
  visibility: 'public', ownerId: 'u1', canManage: true, editors: [], documentManaged: false,
};
const currentUser = { id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user' };

function renderPage(deleteResponse, onTournamentsChanged) {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, options = {}) => {
    if (options.method === 'DELETE') return deleteResponse();
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TournamentManagementPage tournaments={[tournament]} currentUser={currentUser} language="de"
        setSelectedTournamentId={() => {}} onTournamentsChanged={onTournamentsChanged} />
    </QueryClientProvider>,
  );
}

describe('Turnierverwaltung: Turnier löschen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('behandelt 404 als bereits gelöscht und lädt die Liste neu', async () => {
    const onTournamentsChanged = vi.fn();
    renderPage(() => new Response(JSON.stringify({ error: 'Turnier nicht gefunden' }), { status: 404 }), onTournamentsChanged);

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(await screen.findByText('Turnier wurde gelöscht.')).toBeInTheDocument();
    expect(screen.queryByText('Turnier nicht gefunden')).not.toBeInTheDocument();
    expect(onTournamentsChanged).toHaveBeenCalledTimes(1);
  });

  it('gleicht die Liste auch nach einem anderen Fehler mit dem Server ab', async () => {
    const onTournamentsChanged = vi.fn();
    renderPage(() => new Response(JSON.stringify({ error: 'Zugriff verweigert' }), { status: 403 }), onTournamentsChanged);

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));

    expect(await screen.findByText('Zugriff verweigert')).toBeInTheDocument();
    expect(onTournamentsChanged).toHaveBeenCalledTimes(1);
  });
});
