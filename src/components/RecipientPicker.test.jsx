import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(option).toHaveTextContent('Alle Teilnehmer von Herbstturnier · 6.10.2026 · 2 Anmeldungen');

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
});
