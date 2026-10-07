import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '../lib/i18next-config.js';
import { TournamentPicker } from './TournamentPicker.jsx';

const TOURNAMENTS = [
  { id: 't1', name: 'Herbstturnier', date: '2026-10-06', activeRegistrations: 2, waitlistRegistrations: 1 },
  { id: 't2', name: 'Wintercup', date: '2026-12-01', activeRegistrations: 0, waitlistRegistrations: 0 },
];

function renderPicker(onChange = vi.fn()) {
  render(<TournamentPicker label="Turnier" tournaments={TOURNAMENTS} value="" onChange={onChange} currentUserId="user-1" />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  return { input, onChange };
}

describe('TournamentPicker', () => {
  afterEach(() => localStorage.clear());

  it('zeigt Datum und Meldungen (inkl. Warteliste) in der zweiten Zeile und findet Turniere darüber', () => {
    const { input } = renderPicker();
    const option = screen.getByRole('option', { name: /Herbstturnier/ });
    expect(option.querySelector('.recipient-picker-label')).toHaveTextContent('Herbstturnier');
    expect(option.querySelector('.recipient-picker-meta')).toHaveTextContent('6.10.2026 · 3 Anmeldungen');

    fireEvent.change(input, { target: { value: '1.12.2026' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Wintercup');
  });

  it('merkt sich die Auswahl als zuletzt verwendet und zeigt Favoriten zuerst', () => {
    const { input, onChange } = renderPicker();
    fireEvent.click(screen.getByRole('option', { name: /Wintercup/ }));
    expect(onChange).toHaveBeenCalledWith('t2');
    expect(input).toHaveValue('Wintercup · 1.12.2026');
    expect(JSON.parse(localStorage.getItem('ptm_tournament_recents_user-1'))).toEqual(['t2']);

    fireEvent.focus(input);
    const stars = screen.getAllByRole('button', { name: 'Als Favorit markieren/entfernen' });
    fireEvent.click(stars[stars.length - 1]);
    const favorites = screen.getByText('Favoriten').closest('.recipient-picker-group');
    expect(within(favorites).getByRole('option')).toHaveTextContent('Herbstturnier');
    expect(screen.getByText('Zuletzt verwendet').closest('.recipient-picker-group')).toHaveTextContent('Wintercup');
  });
});
