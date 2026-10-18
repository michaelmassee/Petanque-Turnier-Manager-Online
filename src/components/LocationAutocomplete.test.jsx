import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api.js';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';

vi.mock('../lib/api.js', () => ({ api: vi.fn() }));

const place = { id: 'p1', clubName: 'BC Linden', name: 'Boulehalle', address: 'Hauptstraße 12, Linden', latitude: 50, longitude: 8 };
const address = { displayName: 'Marktplatz 1, Berlin', lat: 52, lng: 13 };

function Picker({ initialValue = '', places = [], onSelect = vi.fn() }) {
  const [value, setValue] = useState(initialValue);
  const [confirmed, setConfirmed] = useState(false);
  return <LocationAutocomplete label="Ort" value={value} places={places} confirmed={confirmed}
    onChange={(next) => { setValue(next); setConfirmed(false); }}
    onSelect={(candidate) => { setValue(candidate.displayName); setConfirmed(true); onSelect(candidate); }} />;
}

function type(value) {
  const input = screen.getByRole('combobox', { name: 'Ort' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

async function advance(ms = 700) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('Ortssuche', () => {
  beforeEach(() => { vi.useFakeTimers(); api.mockReset(); api.mockResolvedValue({ results: [address] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('zeigt gespeicherte Plätze sofort und ergänzt danach Adresstreffer', async () => {
    const onSelect = vi.fn();
    render(<Picker places={[place]} onSelect={onSelect} />);
    type('linden halle haupt');
    expect(screen.getByRole('option', { name: /BC Linden.*Boulehalle.*Hauptstraße/ })).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    await advance();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'BC Linden · Boulehalle · Hauptstraße 12, Linden', address.displayName,
    ]);
    fireEvent.click(screen.getByRole('option', { name: /BC Linden/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ boulePlaceId: 'p1', displayName: place.address, lat: 50, lng: 8 }));
    await advance();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox')).toHaveValue(place.address);
  });

  it('lädt weder beim Öffnen noch bei kurzen Eingaben und bündelt Tippen', async () => {
    render(<Picker initialValue="Bestehende Adresse" />);
    await advance();
    type('Be');
    await advance();
    expect(api).not.toHaveBeenCalled();
    type('Berl');
    await advance(500);
    type('Berlin');
    await advance(699);
    expect(api).not.toHaveBeenCalled();
    await advance(1);
    expect(api).toHaveBeenCalledTimes(1);
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ query: 'Berlin' });
    expect(screen.getByRole('option', { name: address.displayName })).toBeInTheDocument();
  });

  it('verwendet gecachte Suchergebnisse erneut ohne weitere Anfrage', async () => {
    render(<Picker />);
    type('Berlin');
    await advance();
    type('Be');
    type('Berlin');
    await advance();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('option')).toHaveTextContent(address.displayName);
  });

  it('bricht veraltete Anfragen ab und ignoriert verspätete Antworten', async () => {
    let resolveOld;
    api.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    render(<Picker />);
    type('Berlin');
    await advance();
    const signal = api.mock.calls[0][1].signal;
    type('München');
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveOld({ results: [address] }); });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('sucht nach Verlassen des Felds nicht weiter und öffnet es durch Antworten nicht erneut', async () => {
    let resolveSearch;
    api.mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    render(<Picker />);
    const input = type('Berlin');
    fireEvent.blur(input);
    await advance();
    expect(api).not.toHaveBeenCalled();
    fireEvent.focus(input);
    await advance();
    fireEvent.blur(input);
    await act(async () => { resolveSearch({ results: [address] }); });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('unterstützt Tastaturauswahl und sucht nach der Auswahl nicht erneut', async () => {
    const onSelect = vi.fn();
    render(<Picker onSelect={onSelect} />);
    const input = type('Berlin');
    await advance();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(address);
    await advance();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('zeigt leere Ergebnisse direkt an und wartet während IME-Eingaben', async () => {
    api.mockResolvedValue({ results: [] });
    render(<Picker />);
    const input = screen.getByRole('combobox');
    fireEvent.compositionStart(input);
    type('Berlin');
    await advance();
    expect(api).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await advance();
    expect(screen.getByText('Kein Ort gefunden. Bitte Eingabe prüfen.')).toBeInTheDocument();
  });
});
