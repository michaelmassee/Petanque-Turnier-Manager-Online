import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import i18next from '../lib/i18next-config.js';
import * as api from '../lib/api.js';
import { UserManagementPanel } from './UserManagementPanel.jsx';

describe('Letzte Anmeldung in der Admin-Benutzerliste', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await i18next.changeLanguage('de');
  });

  it.each([
    ['de', 'Zuletzt angemeldet', 'Bisher nicht erfasst'],
    ['en', 'Last signed in', 'Not recorded yet'],
  ])('zeigt Datum/Uhrzeit und fehlende Historie auf %s an', async (language, label, unknown) => {
    await i18next.changeLanguage(language);
    const timestamp = '2026-10-26T12:34:00.000Z';
    vi.spyOn(api, 'authenticatedApi').mockImplementation(async (path) => path === '/api/users' ? { users: [
      { id: 'anna', firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', role: 'user', lastLoginAt: timestamp },
      { id: 'bert', firstName: 'Bert', lastName: 'Bauer', email: 'bert@example.test', role: 'user', lastLoginAt: null },
    ] } : { reports: [] });
    render(<UserManagementPanel currentUser={{ id: 'admin' }} />);

    const row = (await screen.findByText('Anna Schmidt')).closest('article');
    const time = row.querySelector('time');
    expect(time).toHaveAttribute('datetime', timestamp);
    expect(time).toHaveTextContent(new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp)));
    expect(time.parentElement).toHaveTextContent(`${label}:`);
    const unknownRow = screen.getByText('Bert Bauer').closest('article');
    expect(within(unknownRow).getByText(`${label}: ${unknown}`)).toBeInTheDocument();
    expect(unknownRow.querySelector('time')).toBeNull();
  });

  it('sortiert die Liste nach Name, zuletzt online oder Verein und zeigt „zuletzt online“ an', async () => {
    vi.spyOn(api, 'authenticatedApi').mockImplementation(async (path) => path === '/api/users' ? { users: [
      { id: 'bert', firstName: 'Bert', lastName: 'Bauer', email: 'bert@example.test', role: 'user', club: 'BC Linden', lastSeenAt: '2026-10-20T10:00:00.000Z' },
      { id: 'anna', firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', role: 'user', club: null, lastSeenAt: null },
      { id: 'carl', firstName: 'Carl', lastName: 'Clas', email: 'carl@example.test', role: 'user', club: 'Ärzte Boule', lastSeenAt: '2026-10-27T08:00:00.000Z' },
    ] } : { reports: [] });
    render(<UserManagementPanel currentUser={{ id: 'admin' }} />);
    const names = () => [...document.querySelectorAll('.user-row strong')].map((node) => node.textContent);
    await screen.findByText('Anna Schmidt');
    expect(names()).toEqual(['Anna Schmidt', 'Bert Bauer', 'Carl Clas']);

    const sort = screen.getByLabelText('Sortieren nach');
    fireEvent.change(sort, { target: { value: 'lastSeen' } });
    expect(names()).toEqual(['Carl Clas', 'Bert Bauer', 'Anna Schmidt']);
    fireEvent.change(sort, { target: { value: 'club' } });
    expect(names()).toEqual(['Carl Clas', 'Bert Bauer', 'Anna Schmidt']);

    const row = screen.getByText('Carl Clas').closest('article');
    expect(row.querySelector('time[datetime="2026-10-27T08:00:00.000Z"]').parentElement).toHaveTextContent('Zuletzt online:');
    expect(within(screen.getByText('Anna Schmidt').closest('article')).getByText('Zuletzt online: Bisher nicht erfasst')).toBeInTheDocument();
  });
});
