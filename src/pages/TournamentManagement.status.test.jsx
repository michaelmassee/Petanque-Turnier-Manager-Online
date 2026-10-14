import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '../lib/i18next-config.js';
import { TournamentList } from './TournamentManagement.jsx';

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

    expect(row.getByText('Anmeldung offen')).toBeInTheDocument();
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
});
