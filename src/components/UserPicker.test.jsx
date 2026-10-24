import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { UserPicker, rememberPickedUser } from './UserPicker.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));

const USERS = [
  { id: 'a', firstName: 'Anna', lastName: 'Anders', username: 'anna' },
  { id: 'b', firstName: 'Bernd', lastName: 'Becker', username: 'bernd' },
  { id: 'c', firstName: 'Carla', lastName: 'Clausen', username: 'carla' },
];

function sectionOf(name) {
  return screen.getByText(name, { selector: '.recipient-picker-section-heading' }).closest('.recipient-picker-group');
}

describe('UserPicker', () => {
  afterEach(() => {
    localStorage.clear();
    vi.mocked(authenticatedApi).mockReset();
  });

  it('teilt Favoriten und „Zuletzt verwendet“ mit dem Postfach und blendet ausgeschlossene Nutzer aus', () => {
    // Favorit aus dem Postfach-Empfänger-Picker (gleicher Speicherbereich).
    localStorage.setItem('ptm_postbox_favorites_me', JSON.stringify(['c']));
    rememberPickedUser('me', 'b');
    const onChange = vi.fn();
    render(<UserPicker label="Benutzer hinzufügen" users={USERS} excludeIds={['a']} value="" onChange={onChange} currentUserId="me" />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Benutzer hinzufügen' }));
    expect(within(sectionOf('Favoriten')).getByRole('option', { name: /Carla Clausen/ })).toBeInTheDocument();
    expect(within(sectionOf('Zuletzt verwendet')).getByRole('option', { name: /Bernd Becker/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Anna Anders/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Bernd Becker/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('findet Nutzer über die vollständige E-Mail-Adresse, aber keine ausgeschlossenen', async () => {
    vi.mocked(authenticatedApi).mockResolvedValue({ recipient: { id: 'd', firstName: 'Dora', lastName: 'Dietz', username: 'dora' } });
    render(<UserPicker label="Benutzer hinzufügen" users={USERS} value="" onChange={vi.fn()} currentUserId="me" />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'dora@example.org' } });

    await waitFor(() => expect(screen.getByRole('option', { name: /Dora Dietz/ })).toBeInTheDocument());
    expect(authenticatedApi).toHaveBeenCalledWith('/api/postbox/recipients/lookup?email=dora%40example.org');
  });

  it('zeigt in Admin-Listen die E-Mail und durchsucht sie ohne Serveranfrage', () => {
    render(
      <UserPicker label="Owner wechseln" users={[{ id: 'e', firstName: 'Emil', lastName: 'Ernst', email: 'emil@example.org' }]}
        value="" onChange={vi.fn()} currentUserId="admin" withEmail emailLookup={false} />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'emil@example.org' } });
    expect(screen.getByRole('option', { name: /Emil Ernst/ })).toHaveTextContent('emil@example.org');
    expect(authenticatedApi).not.toHaveBeenCalled();
  });
});
