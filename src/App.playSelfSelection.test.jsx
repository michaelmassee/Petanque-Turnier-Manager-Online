import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App.jsx';
import { queryClient } from './lib/query-client.js';

vi.mock('./lib/player-search-turnstile.js', () => ({ playerSearchTurnstileToken: vi.fn(async () => 'fresh-token') }));

describe('Eigene Spielerauswahl unter Turnier starten', () => {
  afterEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it.each(['user', 'admin'])('findet das eigene Konto als %s und übernimmt die Kontoverknüpfung', async (role) => {
    queryClient.clear();
    window.history.replaceState({}, '', '/?tab=play');
    const user = { id: 'me', firstName: 'Olga', lastName: 'Orga', username: 'olga', role, emailVerifiedAt: '2026-01-01' };
    const tournament = {
      id: 't1', ownerId: user.id, name: 'Schnellstart', date: '2026-10-29', location: 'Club',
      type: 'rangliste', registrationType: 'supermelee', formation: 'doublette', status: 'running',
      visibility: 'private', canManage: true,
    };
    const registrations = [];
    const json = (body) => ({ ok: true, json: async () => body });
    const fetchMock = vi.fn(async (path, options = {}) => {
      if (path === '/api/bootstrap') return json({ needsSetup: false, turnstileSiteKey: 'site-key' });
      if (path === '/api/session') return json({ user });
      if (path === '/api/tournaments') return json({ tournaments: [tournament] });
      if (path === '/api/postbox/summary') return json({ unreadCount: 0, todos: [] });
      // Das eigene Konto wird von der Postbox absichtlich nicht geliefert.
      if (path === '/api/postbox/recipients') return json({ recipients: [] });
      if (path === '/api/tournaments/t1/rounds') return json({ rounds: [] });
      if (path === '/api/tournaments/t1/ranking?live=1') return json({ ranking: [] });
      if (path === '/api/tournaments/t1/registration-players/details') {
        expect(JSON.parse(options.body)).toMatchObject({ userId: user.id });
        return json({ player: { ...user, email: 'olga@example.test', proof: 'own-proof' } });
      }
      if (path === '/api/tournaments/t1/registrations') {
        if (options.method === 'POST') {
          const body = JSON.parse(options.body);
          registrations.push({ ...body, id: 'r1', status: 'confirmed', participation: 'active', accountConnected: true });
          return json({ registration: registrations[0] });
        }
        return json({ registrations: [...registrations] });
      }
      return json({});
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByText('Teilnehmer'));
    const first = screen.getByRole('combobox', { name: /Vorname/ });
    fireEvent.focus(first);
    fireEvent.change(first, { target: { value: 'Olg' } });
    fireEvent.click(await screen.findByRole('option', { name: /Olga Orga/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Nachname/ })).toHaveValue('Orga'));
    fireEvent.click(screen.getByRole('button', { name: 'Spieler hinzufügen' }));

    await screen.findByText('Spieler hinzugefügt: Olga Orga');
    const create = fetchMock.mock.calls.find(([path, options]) => path === '/api/tournaments/t1/registrations' && options.method === 'POST');
    expect(JSON.parse(create[1].body)).toMatchObject({ playerSelections: { primary: { userId: user.id, proof: 'own-proof' } } });
    const participation = await screen.findByRole('button', { name: 'Aktiv: Olga Orga' });
    expect(within(participation.closest('.round-participant-row')).getByLabelText('Mit Benutzerkonto verbunden')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/postbox/recipients')).toHaveLength(1);
  });
});
