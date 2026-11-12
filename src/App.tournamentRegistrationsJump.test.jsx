import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

const base = {
  location: 'Ort', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'registration',
  visibility: 'public', maxRegistrations: 16, waitlistRegistrations: 0, canManage: true,
};
const TOURNAMENTS = [
  { ...base, id: 't1', name: 'Erstes Turnier', date: '2026-05-01', activeRegistrations: 0 },
  { ...base, id: 't2', name: 'Zweites Turnier', date: '2026-06-01', activeRegistrations: 1 },
];

function jsonResponse(payload) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

describe('Turnierverwaltung: Sprung zu den Anmeldungen', () => {
  let calls;

  beforeEach(() => {
    calls = [];
    global.fetch = vi.fn((path) => {
      calls.push(path);
      if (path === '/api/bootstrap') return Promise.resolve(jsonResponse({ needsSetup: false }));
      if (path === '/api/session') return Promise.resolve(jsonResponse({ user: { id: 'u1', firstName: 'Test', lastName: 'User', role: 'admin' } }));
      if (path === '/api/tournaments') return Promise.resolve(jsonResponse({ tournaments: TOURNAMENTS }));
      if (path === '/api/tournaments/t2/registrations') {
        return Promise.resolve(jsonResponse({ registrations: [{ id: 'r1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com', status: 'pending', isVip: false }] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    window.scrollTo = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it('öffnet die Anmeldungen des gewählten Turniers', async () => {
    render(<App />);
    fireEvent.click(await screen.findByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByText('Turnierverwaltung'));

    fireEvent.click(await screen.findByRole('button', { name: 'Anmeldungen (1)' }));

    expect(await screen.findByText('Anna Muster')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Turnier anzeigen' }).value).toMatch(/^Zweites Turnier/);
    await waitFor(() => expect(calls).toContain('/api/tournaments/t2/registrations'));
  });
});
