import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api.js';
import { BoulePlaceFields } from '../components/BoulePlaceFields.jsx';
import { PlaceReportPage } from './PlaceReportPage.jsx';
import { PlaceEditByTokenPage } from './PlaceEditByTokenPage.jsx';
import '../lib/i18next-config.js';

vi.mock('../lib/api.js', () => ({ api: vi.fn() }));
vi.mock('../components/layout.jsx', () => ({ StandalonePageHeader: () => null }));
vi.mock('../components/RichTextEditor.jsx', () => ({ RichTextEditor: () => null }));

const place = { name: 'Boulepark', address: 'Parkweg 12, Linden', latitude: 50.123, longitude: 8.456, courtCount: '', description: '', facilities: '', accessible: false };

function renderFields(initial = {}) {
  const changed = vi.fn();
  function Form() {
    const [form, setForm] = useState({ ...place, locationConfirmed: true, ...initial });
    return <form><BoulePlaceFields form={form} setForm={(next) => { changed(next); setForm(next); }} /></form>;
  }
  render(<Form />);
  return changed;
}

const enableCoordinates = () => fireEvent.click(screen.getByRole('checkbox', { name: 'Koordinaten manuell anpassen' }));
const latitudeField = () => screen.getByRole('spinbutton', { name: /Breitengrad/ });
const longitudeField = () => screen.getByRole('spinbutton', { name: /Längengrad/ });

beforeEach(() => { api.mockReset(); });
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('Bouleplatz-Koordinaten', () => {
  it('übernimmt Google-Maps-Koordinaten und lässt die Adresse unverändert', () => {
    const changed = renderFields();
    fireEvent.click(screen.getByRole('button', { name: 'Koordinaten aus Google Maps importieren' }));
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: 'https://www.google.com/maps?q=50.5000636,8.4206376' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ address: place.address, overrideCoordinates: true, latitude: 50.5000636, longitude: 8.4206376 }));
    expect(screen.getByRole('checkbox', { name: 'Koordinaten manuell anpassen' })).toBeChecked();
    expect(latitudeField()).toHaveValue(50.5000636);
    expect(longitudeField()).toHaveValue(8.4206376);
  });
  it('blendet die gespeicherten Koordinaten wie beim Turnier ein und erlaubt Dezimalwerte', () => {
    const changed = renderFields();
    expect(screen.queryByRole('spinbutton', { name: /Breitengrad/ })).not.toBeInTheDocument();
    enableCoordinates();
    expect(latitudeField()).toHaveValue(50.123);
    expect(longitudeField()).toHaveValue(8.456);
    fireEvent.change(latitudeField(), { target: { value: '49.56789' } });
    fireEvent.change(longitudeField(), { target: { value: '7.98765' } });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ overrideCoordinates: true, latitude: '49.56789', longitude: '7.98765' }));
    expect(latitudeField().closest('form').checkValidity()).toBe(true);
    enableCoordinates();
    expect(screen.queryByRole('spinbutton', { name: /Breitengrad/ })).not.toBeInTheDocument();
  });

  it('verlangt im manuellen Modus beide Koordinaten und prüft ihre Grenzen', () => {
    renderFields({ latitude: null, longitude: null });
    enableCoordinates();
    const form = latitudeField().closest('form');
    expect(form.checkValidity()).toBe(false);
    fireEvent.change(latitudeField(), { target: { value: '91' } });
    fireEvent.change(longitudeField(), { target: { value: '181' } });
    expect(latitudeField().validity.rangeOverflow).toBe(true);
    expect(longitudeField().validity.rangeOverflow).toBe(true);
    fireEvent.change(latitudeField(), { target: { value: '-91' } });
    fireEvent.change(longitudeField(), { target: { value: '-181' } });
    expect(latitudeField().validity.rangeUnderflow).toBe(true);
    expect(longitudeField().validity.rangeUnderflow).toBe(true);
    fireEvent.change(latitudeField(), { target: { value: '0' } });
    fireEvent.change(longitudeField(), { target: { value: '0' } });
    expect(form.checkValidity()).toBe(true);
  });

  it.each([false, true])('behandelt neue Adresseingaben passend zum manuellen Modus (%s)', (overrideCoordinates) => {
    const changed = renderFields({ overrideCoordinates });
    fireEvent.change(screen.getByRole('combobox', { name: /Adresse/ }), { target: { value: 'Neuer Parkweg' } });
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({
      locationConfirmed: false,
      latitude: overrideCoordinates ? place.latitude : null,
      longitude: overrideCoordinates ? place.longitude : null,
    }));
  });

  it('übernimmt bei einer Adressauswahl die gefundenen Koordinaten auch im manuellen Modus', async () => {
    api.mockResolvedValue({ results: [{ displayName: 'Neuer Parkweg 1', lat: 51, lng: 9 }] });
    vi.useFakeTimers();
    const changed = renderFields({ overrideCoordinates: true });
    const address = screen.getByRole('combobox', { name: /Adresse/ });
    fireEvent.focus(address);
    fireEvent.change(address, { target: { value: 'Neuer Parkweg' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    fireEvent.click(screen.getByRole('option', { name: 'Neuer Parkweg 1' }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ address: 'Neuer Parkweg 1', latitude: 51, longitude: 9, locationConfirmed: true }));
  });
});

describe('Bouleplatz melden und per E-Mail-Link bearbeiten', () => {
  it('sendet manuelle Koordinaten mit einer neuen Meldung', async () => {
    api.mockResolvedValue({ ok: true });
    render(<PlaceReportPage language="de" currentUser={{ firstName: 'Anna', lastName: 'Boule', email: 'anna@example.test' }} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name', exact: true }), { target: { value: place.name } });
    fireEvent.change(screen.getByRole('combobox', { name: /Adresse/ }), { target: { value: place.address } });
    enableCoordinates();
    fireEvent.change(latitudeField(), { target: { value: '50.123' } });
    fireEvent.change(longitudeField(), { target: { value: '8.456' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Datenschutzerklärung/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Bouleplatz melden' }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(api.mock.calls[0][0]).toBe('/api/place-reports');
    expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({ overrideCoordinates: true, latitude: '50.123', longitude: '8.456' });
    expect(await screen.findByText(/Danke für deine Meldung!/)).toBeInTheDocument();
  });

  it('lädt gespeicherte Koordinaten über den Bearbeitungslink und speichert Korrekturen', async () => {
    window.history.replaceState({}, '', '/platz-bearbeiten?edit_token=test-token');
    api.mockResolvedValueOnce(place).mockResolvedValueOnce({ ok: true });
    render(<PlaceEditByTokenPage language="de" />);
    await screen.findByRole('checkbox', { name: 'Koordinaten manuell anpassen' });
    enableCoordinates();
    expect(latitudeField()).toHaveValue(place.latitude);
    expect(longitudeField()).toHaveValue(place.longitude);
    fireEvent.change(latitudeField(), { target: { value: '49.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls[1][0]).toBe('/api/place-reports/by-token/test-token');
    expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({ overrideCoordinates: true, latitude: '49.75', longitude: place.longitude });
    expect(await screen.findByText(/Deine Änderungen wurden gespeichert/)).toBeInTheDocument();
  });
});
