import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TournamentRegistrationAction } from './TournamentRegistrationAction.jsx';
import { HomeTournaments } from '../App.jsx';
import { TournamentDetailPage } from '../pages/TournamentDetailPage.jsx';
import '../lib/i18next-config.js';

const tournament = { id: 't1', name: 'Turnier', status: 'registration', visibility: 'public', registrationEnabled: true,
  registrationOpeningPending: true, registrationOpensAt: '2099-06-01T10:00:00.000Z' };
const response = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
function setup(children, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { client, ...render(<QueryClientProvider client={client}>{children}</QueryClientProvider>) };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Anmelde-Öffnungsbenachrichtigung', () => {
  it('zeigt Gästen den deaktivierten Anmeldebutton ohne persönliche API-Abfrage', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    setup(<TournamentRegistrationAction tournament={tournament} onRegister={() => {}} />);
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeDisabled();
    expect(screen.queryByText('Benachrichtigen, wenn Anmeldung öffnet')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aktiviert und deaktiviert das Abo und zeigt den gespeicherten Zustand', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      requests.push({ url: String(url), method: options?.method || 'GET' });
      return response(String(url).includes('/api/me/') ? { tournamentIds: [] } : { active: options.method === 'PUT' });
    }));
    setup(<TournamentRegistrationAction tournament={tournament} currentUser={{ id: 'u1' }} onRegister={() => {}} />);
    const button = await screen.findByRole('button', { name: 'Benachrichtigen, wenn Anmeldung öffnet' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent('Erinnern');
    expect(button).toHaveAttribute('title', 'Benachrichtigen, wenn Anmeldung öffnet');
    expect(button.querySelector('svg')).toHaveAttribute('fill', 'none');
    fireEvent.click(button);
    const activeButton = await screen.findByRole('button', { name: 'Benachrichtigung aktiv' });
    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
    expect(activeButton).toHaveTextContent('Aktiv');
    expect(activeButton).toHaveAttribute('title', 'Benachrichtigung deaktivieren');
    expect(activeButton.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    fireEvent.click(activeButton);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Benachrichtigen, wenn Anmeldung öffnet' })).toHaveAttribute('aria-pressed', 'false'));
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT', 'DELETE']);
  });

  it('verwendet für mehrere Karten dieselbe Abfrage und erhält den Aktivzustand beim Neuladen', async () => {
    const fetch = vi.fn(async () => response({ tournamentIds: ['t1'] })); vi.stubGlobal('fetch', fetch);
    setup(<>
      <TournamentRegistrationAction tournament={tournament} currentUser={{ id: 'u1' }} onRegister={() => {}} />
      <TournamentRegistrationAction tournament={{ ...tournament, id: 't2' }} currentUser={{ id: 'u1' }} onRegister={() => {}} />
    </>);
    expect(await screen.findByRole('button', { name: 'Benachrichtigung aktiv' })).toBeEnabled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('verwendet bei Nutzerwechsel getrennte Zustände', async () => {
    let ids = ['t1'];
    vi.stubGlobal('fetch', vi.fn(async () => response({ tournamentIds: ids })));
    const { rerender, client } = setup(<TournamentRegistrationAction tournament={tournament} currentUser={{ id: 'u1' }} onRegister={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Benachrichtigung aktiv' })).toBeEnabled();
    ids = [];
    rerender(<QueryClientProvider client={client}><TournamentRegistrationAction tournament={tournament} currentUser={{ id: 'u2' }} onRegister={() => {}} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Benachrichtigen, wenn Anmeldung öffnet' })).toBeEnabled());
  });

  it('wechselt erst nach der gespeicherten Freigabe auf Anmelden', () => {
    const onRegister = vi.fn();
    setup(<TournamentRegistrationAction tournament={{ ...tournament, registrationOpeningPending: false, registrationOpensAt: '2020-01-01' }} currentUser={{ id: 'u1' }} onRegister={onRegister} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(onRegister).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('zeigt denselben Aktivzustand in der echten Turnierliste und den Turnierdetails', async () => {
    const fetch = vi.fn(async () => response({ tournamentIds: ['t1'] })); vi.stubGlobal('fetch', fetch);
    const full = { ...tournament, date: '2099-07-01', type: 'schweizer', formation: 'tete', registrationType: 'forme', location: 'Ort' };
    const user = { id: 'u1', role: 'user', firstName: 'Lea', lastName: 'Boule' };
    setup(<>
      <HomeTournaments language="de" currentUser={user} tournaments={[full]} total={1} onOpenTournament={() => {}} onRegister={() => {}} />
      <TournamentDetailPage route={{ id: 't1', view: 'info' }} tournaments={[full]} currentUser={user} language="de"
        setLanguage={() => {}} navigate={() => {}} menuOpen={false} setMenuOpen={() => {}} setError={() => {}} setMessage={() => {}} />
    </>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Benachrichtigung aktiv' })).toHaveLength(2));
    expect(fetch).toHaveBeenCalledOnce();
  });
});
