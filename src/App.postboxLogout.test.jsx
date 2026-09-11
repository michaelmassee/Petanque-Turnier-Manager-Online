import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { queryClient } from './lib/query-client.js';

const TOURNAMENTS = [{
  id: 't1', name: 'Offenes Turnier', location: 'Musterstadt', date: '2026-05-01',
  formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'registration',
  visibility: 'public', activeRegistrations: 0, maxRegistrations: 16, waitlistRegistrations: 0,
  canManage: false,
}];

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

describe('Postbox nach Logout', () => {
  beforeEach(() => {
    queryClient.clear();
    let postboxRequests = 0;
    global.fetch = vi.fn((path) => {
      if (path === '/api/bootstrap') return Promise.resolve(jsonResponse({ needsSetup: false }));
      if (path === '/api/session') return Promise.resolve(jsonResponse({ user: { id: 'u1', firstName: 'Erste', lastName: 'Person', role: 'user' } }));
      if (path === '/api/tournaments') return Promise.resolve(jsonResponse({ tournaments: TOURNAMENTS }));
      if (path === '/api/postbox') {
        postboxRequests += 1;
        if (postboxRequests === 1) return Promise.resolve(jsonResponse({ messages: [{ id: 'm1', kind: 'direct', body: 'Geheime Nachricht', mine: false, senderName: 'Absender', createdAt: '2026-01-01T00:00:00.000Z' }], unreadCount: 1, todos: [] }));
        return new Promise(() => {});
      }
      if (path === '/api/postbox/recipients') return Promise.resolve(jsonResponse({ recipients: [], tournaments: [] }));
      if (path === '/api/logout') return Promise.resolve(jsonResponse({}));
      if (path === '/api/login') return Promise.resolve(jsonResponse({ user: { id: 'u2', firstName: 'Zweite', lastName: 'Person', role: 'user' } }));
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('zeigt beim erneuten Login keine Nachrichten des vorherigen Kontos, solange die neue Postbox lädt', async () => {
    render(<App />);

    fireEvent.click(await screen.findByLabelText('Postbox'));
    expect(await screen.findByText('Geheime Nachricht')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(screen.queryByLabelText('Postbox')).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    const loginForm = screen.getByRole('dialog').querySelector('form');
    const [email, password] = loginForm.querySelectorAll('input');
    fireEvent.change(email, { target: { value: 'zweite@example.com' } });
    fireEvent.change(password, { target: { value: 'sicheres-passwort' } });
    fireEvent.submit(loginForm);

    expect(await screen.findByText('Angemeldet.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Postbox'));
    expect(screen.queryByText('Geheime Nachricht')).not.toBeInTheDocument();
  });
});
