import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';

const TOURNAMENTS = [
  {
    id: 't1',
    name: 'Fremdturnier',
    location: 'Nachbarstadt',
    date: '2026-05-01',
    formation: 'doublette',
    registrationType: 'forme',
    type: 'ko',
    status: 'registration',
    visibility: 'public',
    activeRegistrations: 0,
    maxRegistrations: 16,
    waitlistRegistrations: 0,
    canManage: false,
  },
  {
    id: 't2',
    name: 'Eigenes Turnier',
    location: 'Musterstadt',
    date: '2026-06-01',
    formation: 'tete',
    registrationType: 'forme',
    type: 'ko',
    status: 'registration',
    visibility: 'public',
    activeRegistrations: 1,
    maxRegistrations: 16,
    waitlistRegistrations: 0,
    canManage: true,
  },
];

const REGISTRATIONS = [
  { id: 'r1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', teamName: 'Team A', status: 'pending', isVip: false },
];

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

function installFetchMock(calls) {
  global.fetch = vi.fn((path) => {
    calls.push(path);
    if (path === '/api/bootstrap') {
      return Promise.resolve(jsonResponse({ needsSetup: false }));
    }
    if (path === '/api/session') {
      return Promise.resolve(jsonResponse({ user: { id: 'u1', firstName: 'Test', lastName: 'User', role: 'admin' } }));
    }
    if (path === '/api/tournaments') {
      return Promise.resolve(jsonResponse({ tournaments: TOURNAMENTS }));
    }
    if (path === '/api/users') {
      return Promise.resolve(jsonResponse({ users: [] }));
    }
    if (path === '/api/tournaments/t2/registrations') {
      return Promise.resolve(jsonResponse({ registrations: REGISTRATIONS }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

describe('Anmeldungen: automatische Turnierauswahl beim ersten Öffnen', () => {
  let calls;

  beforeEach(() => {
    calls = [];
    installFetchMock(calls);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wählt ein verwaltbares Turnier automatisch aus und zeigt dessen Anmeldungen ohne manuelle Nachauswahl', async () => {
    render(<App />);

    fireEvent.click(await screen.findByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByText('Anmeldungen'));

    expect(await screen.findByText('Anna Muster')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Eigenes Turnier')).toBeInTheDocument();

    await waitFor(() => expect(calls).toContain('/api/tournaments/t2/registrations'));
    expect(calls).not.toContain('/api/tournaments/t1/registrations');
  });

  it('öffnet Turnier melden aus dem geöffneten Menü, ohne den neuen Routen-Eintrag zurückzunehmen', async () => {
    const historyGo = vi.spyOn(window.history, 'go');
    render(<App />);

    fireEvent.click(await screen.findByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByRole('button', { name: 'Turnier melden' }));

    expect(await screen.findByText(/Melde ein Petanque-Turnier/)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/turnier-melden');
    expect(historyGo).not.toHaveBeenCalled();
  });
});
