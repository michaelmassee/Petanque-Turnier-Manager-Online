import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';
import { queryClient } from './lib/query-client.js';

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

describe('Hamburger-Menü behält den Bereich', () => {
  beforeEach(() => {
    queryClient.clear();
    global.fetch = vi.fn((path) => {
      if (path === '/api/bootstrap') return Promise.resolve(jsonResponse({ needsSetup: false }));
      if (path === '/api/session') return Promise.resolve(jsonResponse({ user: { id: 'u1', firstName: 'Erste', lastName: 'Person', role: 'user' } }));
      if (path === '/api/tournaments') return Promise.resolve(jsonResponse({ tournaments: [] }));
      if (path === '/api/postbox/summary') return Promise.resolve(jsonResponse({ unreadCount: 0, todos: [] }));
      if (path === '/api/api-keys') return Promise.resolve(jsonResponse({ apiKeys: [] }));
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('zeigt nach „Mein Profil“ aus Plätze & Vereine weiter das Menü dieses Bereichs', async () => {
    window.history.pushState({}, '', '/plaetze');
    render(<App />);

    fireEvent.click(await screen.findByLabelText('Menü öffnen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mein Profil' }));

    expect((await screen.findAllByRole('heading', { name: 'Mein Profil' })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.getByRole('button', { name: 'Meine Vereine' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turnierverwaltung' })).not.toBeInTheDocument();
  });

  it('zeigt auf „Mein Profil“ von der Startseite das Turniere-Menü mit der Turnierverwaltung', async () => {
    render(<App />);

    fireEvent.click(await screen.findByLabelText('Menü öffnen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mein Profil' }));

    expect((await screen.findAllByRole('heading', { name: 'Mein Profil' })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.getByRole('button', { name: 'Turnierverwaltung' })).toBeInTheDocument();
  });
});
