import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { LiveQrDialog } from './LiveQrDialog.jsx';

vi.mock('qr-code-styling', () => ({ default: class { append() {} } }));
vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));
vi.mock('../lib/qr-style.js', async (importOriginal) => ({ ...(await importOriginal()), loadQrLogo: () => Promise.resolve('/icons/logo.png') }));

const TEAM_A = { id: 'a', firstName: 'Team', lastName: 'A' };
const TEAM_B = { id: 'b', firstName: 'Team', lastName: 'B' };
const nichtWiederherstellbar = Object.assign(new Error('nicht wiederherstellbar'), { payload: { details: { code: 'live_link_not_recoverable' } } });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe('QR-Code Live-Ansicht', () => {
  beforeEach(() => { authenticatedApi.mockReset(); });

  it('zeigt eine verspätete Antwort auf „Neuen Live-Link erzeugen“ nicht bei einer anderen Meldung', async () => {
    const erneuern = deferred();
    authenticatedApi.mockImplementation((path, options) => {
      if (options?.method === 'POST') return erneuern.promise;
      return path.includes('/a/') ? Promise.reject(nichtWiederherstellbar) : Promise.resolve({ url: 'https://ptm.test/live/b' });
    });
    const { rerender } = render(<LiveQrDialog registration={TEAM_A} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Neuen Live-Link erzeugen' }));

    rerender(<LiveQrDialog registration={null} onClose={() => {}} />);
    rerender(<LiveQrDialog registration={TEAM_B} onClose={() => {}} />);
    expect(await screen.findByText('https://ptm.test/live/b')).toBeTruthy();

    await act(async () => erneuern.resolve({ url: 'https://ptm.test/live/a' }));
    expect(screen.getByText('https://ptm.test/live/b')).toBeTruthy();
    expect(screen.queryByText('https://ptm.test/live/a')).toBeNull();
  });

  it('zeigt den neuen Link, wenn die Meldung noch offen ist', async () => {
    authenticatedApi.mockImplementation((path, options) => (options?.method === 'POST'
      ? Promise.resolve({ url: 'https://ptm.test/live/a-neu' }) : Promise.reject(nichtWiederherstellbar)));
    render(<LiveQrDialog registration={TEAM_A} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Neuen Live-Link erzeugen' }));

    expect(await screen.findByText('https://ptm.test/live/a-neu')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Neuen Live-Link erzeugen' })).toBeNull();
  });
});
