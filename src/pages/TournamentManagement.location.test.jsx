import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_TOURNAMENT_FORM } from '../lib/constants.js';
import { api } from '../lib/api.js';
import { TournamentForm, tournamentToForm } from './TournamentManagement.jsx';

vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn(() => new Promise(() => {})) }));

const place = { id: 'p1', clubName: 'BC Linden', name: 'Boulehalle', address: 'Hauptstraße 12, Linden', latitude: 50, longitude: 8 };
const tournament = { id: 't1', name: 'Turnier', date: '2026-11-01', location: place.address, boulePlaceId: place.id, latitude: 50, longitude: 8 };

function renderForm(mode, initial, changed = vi.fn()) {
  function Form() {
    const [form, setForm] = useState(initial);
    return <TournamentForm form={form} setForm={(next) => { changed(next); setForm(next); }}
      mode={mode} language="de" boulePlaces={[place]} />;
  }
  render(<Form />);
  return changed;
}

describe('Turnierort in einem Suchfeld', () => {
  it('übernimmt beim Bearbeiten den gespeicherten Bouleplatz ins Formular', () => {
    expect(tournamentToForm(tournament)).toMatchObject({ boulePlaceId: place.id, latitude: 50, longitude: 8 });
    expect(tournamentToForm({ ...tournament, boulePlaceId: null }).boulePlaceId).toBe('');
  });

  it.each(['create', 'edit'])('übernimmt Platz und Koordinaten und löst die Auswahl bei neuer Eingabe (%s)', (mode) => {
    const initial = mode === 'edit' ? tournamentToForm(tournament)
      : { ...EMPTY_TOURNAMENT_FORM, name: 'Turnier', location: place.address, boulePlaceId: place.id, latitude: 50, longitude: 8 };
    const changed = renderForm(mode, initial);
    expect(screen.queryByRole('combobox', { name: 'Bouleplatz' })).not.toBeInTheDocument();
    expect(screen.queryByText('Individuellen Ort verwenden')).not.toBeInTheDocument();
    const input = screen.getByRole('combobox', { name: /^Ort/ });
    expect(input).toBeEnabled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Linden Halle' } });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ boulePlaceId: '', latitude: '', longitude: '', locationConfirmed: false }));
    fireEvent.click(screen.getByRole('option', { name: /BC Linden.*Boulehalle/ }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ location: place.address, boulePlaceId: place.id,
      latitude: 50, longitude: 8, locationConfirmed: true }));
    expect(input).toHaveValue(place.address);
  });

  it('behält manuell angepasste Koordinaten bei neuer Ortseingabe', () => {
    const changed = renderForm('edit', { ...tournamentToForm(tournament), overrideCoordinates: true, latitude: 49.5, longitude: 7.5 });
    fireEvent.change(screen.getByRole('combobox', { name: /^Ort/ }), { target: { value: 'Anderer Ort' } });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ boulePlaceId: '', latitude: 49.5, longitude: 7.5, locationConfirmed: false }));
  });
});

describe('Ausrichtender Verein', () => {
  const freePlace = { id: 'p0', clubName: null, name: 'Allgemeiner Platz', address: place.address, latitude: 50, longitude: 8 };

  function renderWithPlaces(initial, changed = vi.fn()) {
    function Form() {
      const [form, setForm] = useState(initial);
      return <TournamentForm form={form} setForm={(next) => { changed(next); setForm(next); }}
        mode="create" language="de" boulePlaces={[freePlace, place]} />;
    }
    render(<Form />);
    return changed;
  }

  it('belegt den Verein vor, wenn die gewählte Adresse zu einem Vereinsplatz passt', async () => {
    api.mockResolvedValueOnce({ results: [{ displayName: 'hauptstraße 12, linden', lat: 50, lng: 8 }] });
    vi.useFakeTimers();
    try {
      const changed = renderWithPlaces({ ...EMPTY_TOURNAMENT_FORM, name: 'Turnier' });
      expect(screen.getByRole('textbox', { name: /^Verein/ })).not.toBeRequired();
      const input = screen.getByRole('combobox', { name: /^Ort/ });
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Rathausplatz' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(700); });
      fireEvent.click(screen.getByRole('option', { name: 'hauptstraße 12, linden' }));
      expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ club: 'BC Linden', boulePlaceId: place.id }));
      expect(screen.getByRole('textbox', { name: /^Verein/ })).toHaveValue('BC Linden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('überschreibt einen bereits eingetragenen Verein nicht', () => {
    const changed = renderWithPlaces({ ...EMPTY_TOURNAMENT_FORM, name: 'Turnier', club: 'Gastverein' });
    const input = screen.getByRole('combobox', { name: /^Ort/ });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'BC Linden' } });
    fireEvent.click(screen.getByRole('option', { name: /BC Linden/ }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ club: 'Gastverein', boulePlaceId: place.id }));
  });
});

describe('Turniername', () => {
  it('ist ein einzeiliges Feld und bleibt einzeilig, auch bei eingefügten Zeilenumbrüchen und Enter', () => {
    const changed = renderForm('create', { ...EMPTY_TOURNAMENT_FORM });
    const field = screen.getByRole('textbox', { name: /^Name/ });
    expect(field.tagName).toBe('INPUT');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Ganzen Namen anzeigen' })).not.toBeInTheDocument();
  });

  it('lässt einen zu langen Namen aufklappen und wieder einklappen, der Wert bleibt einzeilig', () => {
    // jsdom rechnet kein Layout: Überlänge über scrollWidth > clientWidth simulieren.
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    try {
      const changed = renderForm('edit', { ...tournamentToForm(tournament), name: 'Großer Preis der Stadt Linden – Supermêlée' });
      const toggle = screen.getByRole('button', { name: 'Ganzen Namen anzeigen' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);

      const area = screen.getByRole('textbox', { name: /^Name/ });
      expect(area.tagName).toBe('TEXTAREA');
      expect(area).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Einzeilig anzeigen' })).toHaveAttribute('aria-expanded', 'true');
      fireEvent.change(area, { target: { value: 'Herbst-\nTurnier\r\nLinden' } });
      expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Herbst- Turnier Linden' }));

      fireEvent.click(screen.getByRole('button', { name: 'Einzeilig anzeigen' }));
      expect(screen.getByRole('textbox', { name: /^Name/ }).tagName).toBe('INPUT');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('macht das Formular beim Bearbeiten mit leerem Namen ungültig', () => {
    renderForm('edit', { ...tournamentToForm(tournament), name: '' });
    const field = screen.getByRole('textbox', { name: /^Name/ });
    expect(field.closest('form').checkValidity()).toBe(false);
    expect(field.validity.valueMissing).toBe(true);
  });
});
