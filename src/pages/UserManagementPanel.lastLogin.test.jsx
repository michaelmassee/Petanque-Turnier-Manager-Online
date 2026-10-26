import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
});
