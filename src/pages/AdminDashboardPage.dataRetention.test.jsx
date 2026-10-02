import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DataRetentionPanel } from './AdminDashboardPage.jsx';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Admin: Schalter automatische Datenlöschung', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeigt die fälligen Turniere und speichert erst nach einer Änderung', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => (options.method === 'PUT'
      ? jsonResponse({ automaticPurgeEnabled: true, dueTournaments: 3 })
      : jsonResponse({ automaticPurgeEnabled: false, dueTournaments: 3 })));
    render(<DataRetentionPanel />);

    expect(await screen.findByText(/jetzt 3 beendete Turniere/)).toBeInTheDocument();
    const speichern = screen.getByRole('button', { name: 'Speichern' });
    expect(speichern).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Automatische Löschung einschalten/ }));
    fireEvent.click(speichern);

    expect(await screen.findByRole('status')).toHaveTextContent('Einstellung gespeichert.');
    const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ automaticPurgeEnabled: true });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Automatische Löschung einschalten/ })).toBeChecked());
  });
});
