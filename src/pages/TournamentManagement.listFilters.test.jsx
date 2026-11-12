import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { DEFAULT_TOURNAMENT_SORT, sortManagedTournaments, TournamentList } from './TournamentManagement.jsx';

const base = {
  location: 'Ort', timezone: 'Europe/Berlin', formation: 'doublette', registrationType: 'forme', type: 'schweizer',
  status: 'registration', visibility: 'public', maxRegistrations: 32, waitlistRegistrations: 0, canManage: true,
};
const anna = { id: 'u1', firstName: 'Anna', lastName: 'Ahorn' };
const bert = { id: 'u2', firstName: 'Bert', lastName: 'Birke' };
const TOURNAMENTS = [
  { ...base, id: 'a', name: 'Herbstcup', date: '2026-10-18', startTime: '13:00', club: 'BC Linden', ownerId: 'u1', owner: anna, createdAt: '2026-10-11T16:33:00Z', activeRegistrations: 11 },
  { ...base, id: 'b', name: 'Merci Montag', date: '2026-10-26', startTime: '19:00', club: 'PC Petterweil', ownerId: 'u2', owner: bert, createdAt: '2026-10-25T20:44:00Z', activeRegistrations: 33 },
  { ...base, id: 'c', name: 'Nebenbouler', date: '2026-11-04', startTime: '14:30', club: 'BC Linden', ownerId: 'u2', owner: bert, createdAt: '2026-11-04T09:59:00Z', activeRegistrations: 9 },
  { ...base, id: 'd', name: 'Ohne Verein', date: '2026-10-17', startTime: '', club: null, ownerId: 'u1', owner: anna, createdAt: '2026-10-14T16:02:00Z', activeRegistrations: 0 },
];

// Hält Filter und Sortierung wie TournamentManagementPage.
function Liste({ onOpenRegistrations = vi.fn() }) {
  const [ownerFilter, setOwnerFilter] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [sortOrder, setSortOrder] = useState(DEFAULT_TOURNAMENT_SORT);
  return (
    <TournamentList
      tournaments={TOURNAMENTS} qrSourceTournaments={TOURNAMENTS} totalTournaments={TOURNAMENTS.length}
      selectedId="" language="de" query="" statusFilter=""
      ownerFilter={ownerFilter} onOwnerFilterChange={setOwnerFilter}
      clubFilter={clubFilter} onClubFilterChange={setClubFilter}
      sortOrder={sortOrder} onSortOrderChange={setSortOrder}
      onOpenRegistrations={onOpenRegistrations}
      onResetFilters={() => { setOwnerFilter(''); setClubFilter(''); setSortOrder(DEFAULT_TOURNAMENT_SORT); }}
    />
  );
}

const names = () => screen.getAllByRole('article').map((row) => row.querySelector('strong').textContent);

describe('Turnierverwaltung: Filter, Sortierung, Sprung zu den Anmeldungen', () => {
  it('sortiert nach Startdatum, Erstellt und Anzahl Anmeldungen', () => {
    const ids = (order) => sortManagedTournaments(TOURNAMENTS, order).map((tournament) => tournament.id);
    expect(ids('start_asc')).toEqual(['d', 'a', 'b', 'c']);
    expect(ids('start_desc')).toEqual(['c', 'b', 'a', 'd']);
    expect(ids('created_desc')).toEqual(['c', 'b', 'd', 'a']);
    expect(ids('created_asc')).toEqual(['a', 'd', 'b', 'c']);
    expect(ids('registrations_desc')).toEqual(['b', 'a', 'c', 'd']);
  });

  it('filtert nach Owner und Verein, sortiert per Auswahl und setzt alles zurück', () => {
    render(<Liste />);
    expect(names()).toEqual(['Ohne Verein', 'Herbstcup', 'Merci Montag', 'Nebenbouler']);

    fireEvent.change(screen.getByLabelText('Owner filtern'), { target: { value: 'u2' } });
    expect(names()).toEqual(['Merci Montag', 'Nebenbouler']);
    expect(screen.getByText('2/4')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Verein filtern'), { target: { value: 'BC Linden' } });
    expect(names()).toEqual(['Nebenbouler']);

    fireEvent.change(screen.getByLabelText('Owner filtern'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Sortieren nach'), { target: { value: 'registrations_desc' } });
    expect(names()).toEqual(['Herbstcup', 'Nebenbouler']);

    // Die Auswahl bietet alle Vereine und Owner, auch wenn die Liste gerade gefiltert ist.
    expect([...screen.getByLabelText('Verein filtern').options].map((option) => option.textContent))
      .toEqual(['Alle Vereine', 'BC Linden', 'PC Petterweil']);
    expect([...screen.getByLabelText('Owner filtern').options].map((option) => option.textContent))
      .toEqual(['Alle Owner', 'Anna Ahorn', 'Bert Birke']);

    fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(names()).toEqual(['Ohne Verein', 'Herbstcup', 'Merci Montag', 'Nebenbouler']);
    expect(screen.getByLabelText('Sortieren nach').value).toBe('start_asc');
  });

  it('bietet den Owner-Filter nur bei mehreren Owner an', () => {
    const own = TOURNAMENTS.filter((tournament) => tournament.ownerId === 'u1');
    render(<TournamentList tournaments={own} qrSourceTournaments={own} totalTournaments={own.length} selectedId="" language="de" query="" statusFilter="" />);
    expect(screen.queryByLabelText('Owner filtern')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Verein filtern')).toBeInTheDocument();
  });

  it('springt mit der Anzahl der Anmeldungen zu den Anmeldungen des Turniers', () => {
    const onOpenRegistrations = vi.fn();
    render(<Liste onOpenRegistrations={onOpenRegistrations} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anmeldungen (33)' }));
    expect(onOpenRegistrations).toHaveBeenCalledWith('b');
  });
});
