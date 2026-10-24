// Ohne Mail-Freischaltung gehen Statusmeldungen zum Turnier nur ins interne Postfach: deutlicher Hinweis für den
// Ersteller beim Anlegen und für den Owner beim Bearbeiten, nicht für Bearbeiter und Admins.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentManagementPage } from './TournamentManagement.jsx';

const jsonResponse = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

const tournament = {
  id: 't1', name: 'Sommerturnier', date: '2099-07-01', location: 'Ort', formation: 'doublette', status: 'registration',
  visibility: 'public', ownerId: 'u1', canManage: true, editors: [],
};
const NOTICE = 'E-Mail-Versand nicht freigeschaltet';

describe('Hinweis ohne Mail-Freischaltung', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPage(currentUser) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
      if (path === '/api/postbox/recipients') return jsonResponse({ recipients: [], tournaments: [] });
      if (String(path).endsWith('/editors')) return jsonResponse({ editors: [] });
      return jsonResponse({});
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TournamentManagementPage tournaments={[tournament]} currentUser={currentUser} language="de" setSelectedTournamentId={() => {}} />
      </QueryClientProvider>,
    );
  }

  it('zeigt dem Ersteller beim Anlegen, dass Statusmeldungen nur im Postfach landen', async () => {
    renderPage({ id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user', mailEnabled: false });

    fireEvent.click(screen.getByRole('button', { name: 'Neues Turnier' }));

    const notice = (await screen.findByText(NOTICE)).closest('[role="note"]');
    expect(notice).toHaveTextContent('landen nur in deinem internen Postfach und werden nicht per E-Mail verschickt');
  });

  it('zeigt den Hinweis dem Owner beim Bearbeiten', async () => {
    renderPage({ id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user', mailEnabled: false });

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  });

  it('zeigt den Hinweis nicht Bearbeitern fremder Turniere', async () => {
    renderPage({ id: 'u3', firstName: 'Bea', lastName: 'Bearbeiterin', role: 'user', mailEnabled: false });
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await screen.findByRole('button', { name: 'Turnier speichern' });
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('zeigt den Hinweis nicht, wenn der E-Mail-Versand freigeschaltet ist', async () => {
    renderPage({ id: 'u1', firstName: 'Lea', lastName: 'Leitung', role: 'user', mailEnabled: true });
    fireEvent.click(screen.getByRole('button', { name: 'Neues Turnier' }));
    await screen.findByRole('button', { name: 'Turnier anlegen' });
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
