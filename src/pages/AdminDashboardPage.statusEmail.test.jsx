import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import * as api from '../lib/api.js';
import { StatusEmailTestPanel } from './AdminDashboardPage.jsx';

afterEach(() => vi.restoreAllMocks());

describe('Admin: Test-Statusmail', () => {
  it('sendet auf Klick, zeigt währenddessen den Spinner und danach die Empfängeradresse', async () => {
    let resolve;
    const request = vi.spyOn(api, 'authenticatedApi').mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<StatusEmailTestPanel />);
    const button = screen.getByRole('button', { name: 'Statusmail jetzt an mich senden' });
    fireEvent.click(button);
    expect(request).toHaveBeenCalledWith('/api/admin/status-email/test', { method: 'POST' });
    expect(button).toBeDisabled();
    expect(button.querySelector('.button-spinner')).not.toBeNull();
    resolve({ email: 'admin@example.test' });
    expect(await screen.findByRole('status')).toHaveTextContent('Die Statusmail ist an admin@example.test unterwegs.');
    expect(button).toBeEnabled();
  });

  it('zeigt einen Fehler sichtbar an', async () => {
    vi.spyOn(api, 'authenticatedApi').mockRejectedValue(new Error('Admin-Rolle erforderlich'));
    render(<StatusEmailTestPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Statusmail jetzt an mich senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin-Rolle erforderlich');
  });
});
