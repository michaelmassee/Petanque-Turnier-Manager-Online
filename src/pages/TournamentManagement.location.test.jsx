import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_TOURNAMENT_FORM } from '../lib/constants.js';
import { api } from '../lib/api.js';
import { tournamentPayload } from '../lib/domain.js';
import { TournamentForm, tournamentToForm } from './TournamentManagement.jsx';

vi.mock('../lib/api.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn(() => new Promise(() => {})) }));

const place = { id: 'p1', clubName: 'BC Linden', name: 'Boulehalle', address: 'Hauptstraße 12, Linden', latitude: 50, longitude: 8 };
const tournament = { id: 't1', name: 'Turnier', date: '2026-11-01', location: place.address, boulePlaceId: place.id, latitude: 50, longitude: 8 };

function renderForm(mode, initial, changed = vi.fn(), onSubmit = vi.fn()) {
  function Form() {
    const [form, setForm] = useState(initial);
    return <TournamentForm form={form} setForm={(next) => { changed(next); setForm(next); }}
      mode={mode} language="de" boulePlaces={[place]} onSubmit={onSubmit} />;
  }
  render(<Form />);
  return changed;
}

describe('Turnierort in einem Suchfeld', () => {
  it.each([
    ['create', true], ['edit', true], ['edit', false],
  ])('öffnet die Hilfe direkt hinter Ort und erhält die Formulardaten (%s, Anmeldung %s)', (mode, registrationEnabled) => {
    const changed = vi.fn();
    const submitted = vi.fn();
    renderForm(mode, { ...tournamentToForm(tournament), registrationEnabled, club: 'BC Linden' }, changed, submitted);
    const location = screen.getByRole('combobox', { name: 'Ort', exact: true });
    const help = screen.getByRole('button', { name: 'Hilfe zu Ort, Verein und Koordinaten' });
    expect(help).toHaveClass('help-btn');
    expect(help).toHaveTextContent('? Hilfe');
    expect(help.previousElementSibling).toBe(location.labels[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(help);
    const dialog = screen.getByRole('dialog', { name: 'Ort, Verein und Koordinaten' });
    expect(dialog).toHaveClass('modal-panel--wide');
    expect(within(dialog).getByText(/wenn das Vereinsfeld noch leer ist/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Google-Maps-Icon übernimmt ausschließlich/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Stadtpark/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Ort auswählen → Verein prüfen → Kartenposition korrigieren/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(location).toHaveValue(place.address);
    expect(screen.getByRole('textbox', { name: /^Verein/ })).toHaveValue('BC Linden');
    expect(changed).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
  });

  it.each(['create', 'edit'])('übernimmt den Google-Maps-Punkt ohne Orts- oder Vereinsänderung (%s)', async (mode) => {
    const initial = { ...tournamentToForm(tournament), club: 'BC Linden' };
    const changed = renderForm(mode, initial);
    fireEvent.click(screen.getByRole('button', { name: 'Koordinaten aus Google Maps importieren' }));
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: 'https://www.google.com/maps?q=50.5000636,8.4206376' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    const updated = changed.mock.lastCall[0];
    expect(updated).toMatchObject({ overrideCoordinates: true, latitude: 50.5000636, longitude: 8.4206376,
      location: place.address, club: 'BC Linden', boulePlaceId: place.id });
    expect(tournamentPayload(updated)).toMatchObject({ overrideCoordinates: true, latitude: 50.5000636, longitude: 8.4206376, boulePlaceId: place.id });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Breitengrad' })).toHaveValue(50.5000636);
  });
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
  it('bleibt einzeilig, auch bei eingefügten Zeilenumbrüchen und Enter', () => {
    const changed = renderForm('create', { ...EMPTY_TOURNAMENT_FORM });
    const field = screen.getByRole('textbox', { name: /^Name/ });
    expect(field).toHaveAttribute('rows', '1');
    fireEvent.change(field, { target: { value: 'Herbst-\nTurnier\r\nLinden' } });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Herbst- Turnier Linden' }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
  });

  it.each([
    ['Handy, langer Name', true, 60, '2'],
    ['Handy, kurzer Name', true, 20, '1'],
    ['PC, langer Name', false, 60, '1'],
  ])('zeigt den Namen ohne Aufklappen: %s', (_label, mobile, scrollHeight, rows) => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: mobile && query === '(max-width: 560px)' }));
    // jsdom rechnet kein Layout: einzeilige Höhe 46 px, Überlauf über scrollHeight simulieren.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(20);
    try {
      renderForm('edit', { ...tournamentToForm(tournament), name: 'Großer Preis der Stadt Linden – Supermêlée' });
      expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveAttribute('rows', rows);
      expect(screen.queryByRole('button', { name: /Namen/ })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
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
