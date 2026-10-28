import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentList, TournamentManagementPage } from './TournamentManagement.jsx';

const tournament = {
  id: 't1', name: 'Testturnier', location: 'Musterstadt', date: '2099-06-01',
  timezone: 'Europe/Berlin', formation: 'doublette', registrationType: 'forme', type: 'ko',
  status: 'registration', visibility: 'public', activeRegistrations: 0,
  maxRegistrations: 16, waitlistRegistrations: 0,
};

function renderStatus(overrides = {}) {
  render(<TournamentList
    tournaments={[{ ...tournament, ...overrides }]}
    totalTournaments={1} selectedId="" language="de" query="" statusFilter=""
  />);
  return within(screen.getByRole('article'));
}

describe('Turnierverwaltung: Anmeldestatus', () => {
  afterEach(() => vi.restoreAllMocks());

  it('zeigt den zukünftigen Anmeldebeginn in der Turnierzeitzone', () => {
    const row = renderStatus({ registrationOpensAt: '2099-05-01T10:00:00.000Z' });

    expect(screen.getByText(/^Anmeldung ab .*12:00/)).toBeInTheDocument();
    expect(row.queryByText('Anmeldung offen')).not.toBeInTheDocument();
  });

  it('zeigt auch bei noch ausstehender Freigabe den Anmeldebeginn', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2099-05-01T10:01:00.000Z').getTime());
    const row = renderStatus({ registrationOpensAt: '2099-05-01T10:00:00.000Z', registrationOpeningPending: true });

    expect(screen.getByText(/^Anmeldung ab /)).toBeInTheDocument();
    expect(row.queryByText('Anmeldung offen')).not.toBeInTheDocument();
  });

  it('zeigt nach dem freigegebenen Anmeldebeginn Anmeldung offen', () => {
    const row = renderStatus({ registrationOpensAt: '2020-05-01T10:00:00.000Z', registrationOpeningPending: false });

    expect(row.getByText('16 von 16 Plätzen frei')).toBeInTheDocument();
  });

  it('zeigt für eine ausdrücklich geschlossene Anmeldung weiterhin Anmeldung geschlossen', () => {
    renderStatus({ registrationOpensAt: '2099-05-01T10:00:00.000Z', registrationClosed: true });

    expect(screen.getByText('Anmeldung geschlossen')).toBeInTheDocument();
    expect(screen.queryByText(/^Anmeldung ab /)).not.toBeInTheDocument();
  });

  it('behält den Laufstatus trotz eines zukünftigen Anmeldebeginns bei', () => {
    const row = renderStatus({ status: 'running', registrationOpensAt: '2099-05-01T10:00:00.000Z' });

    expect(row.getByText('Läuft')).toBeInTheDocument();
  });

  it.each([
    [{ registrationDeadline: '2020-01-01T00:00:00.000Z' }, 'Anmeldung nicht mehr möglich', 'status-closed', 'Anmeldeschluss abgelaufen'],
    [{ activeRegistrations: 16, waitlistEnabled: true }, 'Anmeldung Warteliste möglich', 'status-waitlist', null],
    [{ activeRegistrations: 16, waitlistEnabled: false }, 'Anmeldung nicht mehr möglich', 'status-closed', 'ausgebucht'],
    [{ registrationClosesAt: '2020-01-01T00:00:00.000Z' }, 'Die Anmeldung ist mit Turnierbeginn geschlossen', 'status-closed', null],
  ])('zeigt den effektiven Anmeldestatus für %j', (overrides, label, badgeClass, reason) => {
    const row = renderStatus(overrides);
    expect(row.getByText(label)).toHaveClass(badgeClass);
    expect(row.queryByText('Anmeldung offen')).not.toBeInTheDocument();
    if (reason) expect(row.getByText(reason)).toBeInTheDocument();
  });

  it('behält die Sichtbarkeitsanzeige für Kalendereinträge bei', () => {
    const row = renderStatus({ registrationEnabled: false });
    expect(row.getByText('Sichtbar')).toHaveClass('status-calendar');
    expect(row.queryByText('16 von 16 Plätzen frei')).not.toBeInTheDocument();
  });

  it.each([
    [{ registrationClosed: false }, 'Anmeldung schließen', false],
    [{ registrationClosed: true }, 'Anmeldung öffnen', true],
    [{ registrationClosed: false, registrationDeadline: '2020-01-01T00:00:00.000Z' }, 'Anmeldung schließen', true],
  ])('erklärt die Wirkung der manuellen Sperre für %j', (overrides, buttonLabel, hintVisible) => {
    const row = renderStatus({ canManage: true, ...overrides });
    const button = row.getByRole('button', { name: buttonLabel });
    expect(button).toHaveAccessibleDescription(/Die Sichtbarkeit des Turniers bleibt unverändert. Bestehende Wartelistenplätze bleiben erhalten./);
    const hint = row.getByText(/Die Sichtbarkeit des Turniers bleibt unverändert/);
    if (hintVisible) expect(hint).toBeVisible();
    else expect(hint).not.toBeVisible();
  });

  it.each([
    ['draft', 'Entwurf', 'status-draft'],
    ['finished', 'Abgeschlossen', 'status-finished'],
  ])('zeigt für Status %s die Statusbezeichnung statt eines Anmeldestatus', (status, label, badgeClass) => {
    const row = renderStatus({ status });
    expect(row.getByText(label)).toHaveClass(badgeClass);
    expect(row.queryByText('Anmeldung nicht mehr möglich')).not.toBeInTheDocument();
  });

  it.each([
    [{ registrationClosed: false }, 'Anmeldung schließen', 'Anmeldung wurde geschlossen.'],
    [{ registrationClosed: true, registrationDeadline: '2020-01-01T00:00:00.000Z' }, 'Anmeldung öffnen', 'Die manuelle Anmeldesperre wurde aufgehoben. Die Meldefrist ist abgelaufen.'],
    [{ registrationClosed: true, registrationClosesAt: '2020-01-01T00:00:00.000Z' }, 'Anmeldung öffnen', 'Die manuelle Anmeldesperre wurde aufgehoben. Das Turnier hat bereits begonnen'],
    [{ registrationClosed: true }, 'Anmeldung öffnen', 'Die manuelle Anmeldesperre wurde aufgehoben. Meldefrist, Anmeldebeginn und Teilnehmerlimit gelten weiterhin.'],
  ])('meldet die tatsächliche Wirkung nach %j', async (overrides, buttonLabel, message) => {
    const { registrationClosed } = overrides;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const onTournamentsChanged = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TournamentManagementPage
          tournaments={[{ ...tournament, canManage: true, ...overrides, waitlistRegistrations: 1 }]}
          currentUser={{ id: 'u1' }} language="de" setSelectedTournamentId={() => {}}
          onTournamentsChanged={onTournamentsChanged}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: buttonLabel }));
    expect(await screen.findByText((content, node) => node?.classList.contains('feedback') && content.includes(message))).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/t1/registration-closed', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ closed: !registrationClosed }),
    }));
    expect(onTournamentsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 Warteliste')).toBeInTheDocument();
  });

  it('öffnet per Klick aufs Turnier die Turnierdetails wie die Hauptliste und markiert die Zeile', () => {
    const setSelectedTournamentId = vi.fn();
    const onOpenTournament = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TournamentManagementPage
          tournaments={[{ ...tournament, canManage: true }]}
          currentUser={{ id: 'u1' }} language="de" setSelectedTournamentId={setSelectedTournamentId}
          onOpenTournament={onOpenTournament}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Testturnier/ }));
    expect(onOpenTournament).toHaveBeenCalledWith('t1');
    expect(setSelectedTournamentId).toHaveBeenCalledWith('t1');
  });

});
