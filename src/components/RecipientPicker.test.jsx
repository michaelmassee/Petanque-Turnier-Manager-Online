import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { RecipientPicker } from './RecipientPicker.jsx';

describe('RecipientPicker', () => {
  afterEach(() => {
    localStorage.clear();
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
