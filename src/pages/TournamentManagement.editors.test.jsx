// Kandidaten für Bearbeitungsrechte: Die Nutzerliste liest die ganze users-Tabelle und wird deshalb erst geladen,
// wenn Owner oder Admin ein Turnier bearbeiten – nicht beim App-Start und nicht für reine Bearbeiter.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentManagementPage } from './TournamentManagement.jsx';

const jsonResponse = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

const tournament = {
  id: 't1', name: 'Sommerturnier', date: '2099-07-01', location: 'Ort', formation: 'doublette', status: 'registration',
  visibility: 'public', ownerId: 'u1', canManage: true, editors: [],
};

describe('Bearbeitungsrechte: Kandidatenliste', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage(currentUser) {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (path === '/api/postbox/recipients') return jsonResponse({ recipients: [{ id: 'u2', firstName: 'Ed', lastName: 'Editor', username: 'ed' }], tournaments: [] });
      if (String(path).endsWith('/editors')) return jsonResponse({ editors: [] });
      return jsonResponse({});
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TournamentManagementPage tournaments={[tournament]} currentUser={currentUser} language="de" setSelectedTournamentId={() => {}} />
      </QueryClientProvider>,
    );
    const recipientsLoaded = () => fetchMock.mock.calls.some(([path]) => path === '/api/postbox/recipients');
    return { recipientsLoaded };
  }

  it('lädt die Nutzer erst beim Bearbeiten und bietet sie zum Hinzufügen an', async () => {
    const { recipientsLoaded } = renderPage({ id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user' });
    expect(recipientsLoaded()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    const select = await screen.findByLabelText('Benutzer hinzufügen');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Ed Editor (@ed)' })).toBeInTheDocument());
    expect(recipientsLoaded()).toBe(true);
  });

  it('lädt für reine Bearbeiter keine Nutzerliste', async () => {
    const { recipientsLoaded } = renderPage({ id: 'u3', firstName: 'Bea', lastName: 'Bearbeiterin', role: 'user' });

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    await screen.findByRole('button', { name: 'Turnier speichern' });
    expect(recipientsLoaded()).toBe(false);
  });
});
