import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../lib/i18next-config.js';
import { RecipientPicker } from './RecipientPicker.jsx';
import { POSTBOX_ADMIN_RECIPIENT_ID } from '../postbox-core.js';

describe('RecipientPicker', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('ordnet zuletzt verwendete Empfänger, Favoriten, Broadcasts und alle Empfänger ohne Duplikate', () => {
    localStorage.setItem('ptm_postbox_recents_user-1', JSON.stringify(['recent']));
    localStorage.setItem('ptm_postbox_favorites_user-1', JSON.stringify(['recent', 'favorite']));
    render(<RecipientPicker label="Empfänger" recipients={[
      { id: 'recent', firstName: 'Zuletzt' },
      { id: 'favorite', firstName: 'Favorit' },
      { id: 'other', firstName: 'Andere' },
    ]} recipientTournaments={[{ id: 't1', name: 'Broadcast', date: '2026-10-29' }]}
    value="" onChange={vi.fn()} currentUserId="user-1" />);

    fireEvent.focus(screen.getByRole('combobox'));
    const groups = [...screen.getByRole('listbox').querySelectorAll('.recipient-picker-group')];
    expect(groups.map((group) => group.querySelector('.recipient-picker-section-heading').textContent))
      .toEqual(['Zuletzt verwendet', 'Favoriten', 'Turnier-Broadcasts', 'Alle Empfänger']);
    expect(within(groups[0]).getByRole('option')).toHaveTextContent('Zuletzt');
    expect(within(groups[1]).getByRole('option')).toHaveTextContent('Favorit');
    expect(screen.getAllByRole('option', { name: 'Zuletzt' })).toHaveLength(1);
  });

  it('erweitert die Anzeige beim Scrollen und durchsucht alle Empfänger ohne zusätzliche E-Mail-Abfragen', () => {
    const onLookupEmail = vi.fn();
    const recipients = Array.from({ length: 55 }, (_, index) => ({ id: `u${index}`, firstName: `Person ${index}` }));
    render(<RecipientPicker label="Empfänger" recipients={recipients} value="" onChange={vi.fn()}
      currentUserId="user-1" onLookupEmail={onLookupEmail} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getAllByRole('option')).toHaveLength(20);
    fireEvent.scroll(screen.getByRole('listbox'));
    expect(screen.getAllByRole('option')).toHaveLength(40);
    fireEvent.scroll(screen.getByRole('listbox'));
    expect(screen.getAllByRole('option')).toHaveLength(56);

    fireEvent.change(input, { target: { value: 'Person 54' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Person 54');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getAllByRole('option')).toHaveLength(20);
    expect(onLookupEmail).not.toHaveBeenCalled();
  });

  it('erreicht per Tastatur Empfänger jenseits des ersten Blocks', () => {
    const onChange = vi.fn();
    const recipients = Array.from({ length: 30 }, (_, index) => ({ id: `u${index}`, firstName: `Person ${index}` }));
    render(<RecipientPicker label="Empfänger" recipients={recipients} value="" onChange={onChange} currentUserId="user-1" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    for (let index = 0; index < 22; index += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Person 20');
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('aria-posinset', '22');
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('aria-setsize', '31');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('u20');
  });

  it('bietet Admin als gemeinsamen Empfänger mit kurzem Hinweis an', () => {
    const onChange = vi.fn();
    render(<RecipientPicker label="Empfänger" recipients={[]} value="" onChange={onChange} currentUserId="user-1" />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Admin' } });
    const option = screen.getByRole('option', { name: /Nachricht an Admin/ });
    expect(option.querySelector('.recipient-picker-label')).toHaveTextContent(/^Admin$/);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith(POSTBOX_ADMIN_RECIPIENT_ID);
    expect(input).toHaveValue('Admin');
  });

  it('zeigt beim Turnier-Broadcast Datum und pluralisierte Meldungsanzahl und behält den Auswahlwert', () => {
    const onChange = vi.fn();
    render(
      <RecipientPicker
        label="Empfänger"
        recipients={[]}
        recipientTournaments={[{ id: 'tournament-1', name: 'Herbstturnier', date: '2026-10-06', registrationCount: 2 }]}
        value=""
        onChange={onChange}
        currentUserId="user-1"
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));
    const option = screen.getByRole('option', { name: /Herbstturnier/ });
    expect(option.querySelector('.recipient-picker-label')).toHaveTextContent(/^Herbstturnier$/);
    expect(option.querySelector('.recipient-picker-meta')).toHaveTextContent('6.10.2026 · 2 Anmeldungen');

    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('tournament:tournament-1');
    // Im Eingabefeld nur die Kurzform, damit der Text am Handy nicht abgeschnitten wird.
    expect(screen.getByRole('combobox')).toHaveValue('Herbstturnier · 6.10.2026');
  });

  it('macht die angezeigten Turnierdaten durchsuchbar und zeigt null Meldungen', () => {
    render(
      <RecipientPicker
        label="Empfänger"
        recipients={[]}
        recipientTournaments={[{ id: 'tournament-1', name: 'Herbstturnier', date: '2026-10-06', registrationCount: 0 }]}
        value=""
        onChange={vi.fn()}
        currentUserId="user-1"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6.10.2026' } });

    expect(screen.getByRole('option', { name: /Herbstturnier/ })).toHaveTextContent('0 Anmeldungen');
  });

  it('unterscheidet gleichnamige Empfänger über Benutzername und Verein und findet sie darüber', () => {
    const onChange = vi.fn();
    render(
      <RecipientPicker
        label="Empfänger"
        recipients={[
          { id: 'a', firstName: 'Anna', lastName: 'Schmidt', username: 'anna.schmidt', club: 'BC Linden' },
          { id: 'b', firstName: 'Anna', lastName: 'Schmidt', username: 'anna.schmidt2', club: null },
        ]}
        value=""
        onChange={onChange}
        currentUserId="user-1"
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'linden' } });
    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('Anna Schmidt@anna.schmidt · BC Linden');

    fireEvent.change(input, { target: { value: '@anna.schmidt2' } });
    fireEvent.click(screen.getByRole('option'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(input).toHaveValue('Anna Schmidt (@anna.schmidt2)');
  });

  it('sucht bei vollständiger E-Mail-Adresse den Empfänger über den Server', async () => {
    const onLookupEmail = vi.fn(async () => ({ id: 'c', firstName: 'Carl', lastName: 'Clausen', username: 'carl', club: null }));
    render(
      <RecipientPicker label="Empfänger" recipients={[]} value="" onChange={vi.fn()} currentUserId="user-1" onLookupEmail={onLookupEmail} />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Carl@Example.org' } });

    await waitFor(() => expect(screen.getByRole('option', { name: /Carl Clausen/ })).toBeInTheDocument());
    expect(onLookupEmail).toHaveBeenCalledWith('carl@example.org');
    expect(screen.getByRole('option', { name: /Carl Clausen/ })).not.toHaveTextContent('example.org');
  });
});
