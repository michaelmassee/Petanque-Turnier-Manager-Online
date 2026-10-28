import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleMapsImport } from './GoogleMapsImport.jsx';
import { api } from '../lib/api.js';
import '../lib/i18next-config.js';

vi.mock('../lib/api.js', () => ({ api: vi.fn() }));
const POINT = 'https://www.google.com/maps/place/Punkt/@50.5003813,8.417934,574m/data=!3d50.5000636!4d8.4206376';
const SHORT = 'https://maps.app.goo.gl/WrGuVDaSh5nC47SK6';

function setup() {
  const imported = vi.fn();
  const submitted = vi.fn((event) => event.preventDefault());
  function Form() {
    const [location, setLocation] = useState('Linden');
    return <form onSubmit={submitted}>
      <label>Ort<input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
      <GoogleMapsImport location={location} onImport={imported} />
    </form>;
  }
  const view = render(<Form />);
  const trigger = screen.getByRole('button', { name: 'Koordinaten aus Google Maps importieren' });
  return { ...view, trigger, imported, submitted };
}

beforeEach(() => { api.mockReset(); });

describe('Google-Maps-Import als Icon mit Popup', () => {
  it('zeigt erst nach dem Klick ein kompaktes Popup außerhalb des Hauptformulars', () => {
    const { trigger, container, imported, submitted } = setup();
    expect(screen.queryByLabelText('Google-Maps-Link')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Koordinaten aus Google Maps' });
    expect(dialog).toHaveClass('modal-panel--compact');
    expect(container).not.toContainElement(dialog);
    expect(screen.getByLabelText('Google-Maps-Link')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(imported).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('importiert lange Links per Enter ohne Netzwerk oder Formular-Submit', async () => {
    const user = userEvent.setup();
    const { trigger, imported, submitted } = setup();
    await user.click(trigger);
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: POINT } });
    await user.keyboard('{Enter}');
    expect(imported).toHaveBeenCalledExactlyOnceWith({ latitude: 50.5000636, longitude: 8.4206376 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Koordinaten übernommen.');
    expect(trigger).toHaveFocus();
    expect(submitted).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('fragt Kurzlinks erst beim Übernehmen an und lässt währenddessen Abbrechen zu', async () => {
    let resolve;
    api.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { trigger, imported } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: SHORT } });
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(api.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolve({ latitude: 1, longitude: 2 }));
    expect(imported).not.toHaveBeenCalled();
  });

  it('übernimmt die erfolgreiche Kurzlinkantwort', async () => {
    api.mockResolvedValue({ latitude: -33.86, longitude: 151.21 });
    const { trigger, imported } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: SHORT } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() => expect(imported).toHaveBeenCalledWith({ latitude: -33.86, longitude: 151.21 }));
  });

  it('zeigt Fehler im Popup und lässt vorhandene Koordinaten unberührt', async () => {
    const { trigger, imported } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: 'https://www.google.com/maps/@50,8,12z' } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('einen einzelnen Punkt');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(imported).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it.each(['link', 'location'])('ignoriert verspätete Antworten nach Änderung von %s', async (change) => {
    let resolve;
    api.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { trigger, imported } = setup();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: SHORT } });
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    const field = screen.getByLabelText(change === 'link' ? 'Google-Maps-Link' : 'Ort');
    fireEvent.change(field, { target: { value: change === 'link' ? POINT : 'Berlin' } });
    await act(async () => resolve({ latitude: 1, longitude: 2 }));
    expect(imported).not.toHaveBeenCalled();
    if (change === 'location') {
      fireEvent.change(screen.getByLabelText('Ort'), { target: { value: 'Linden' } });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  });

  it('hält Tab im Popup und schließt per Escape', async () => {
    const user = userEvent.setup();
    const { trigger, submitted } = setup();
    await user.click(trigger);
    fireEvent.change(screen.getByLabelText('Google-Maps-Link'), { target: { value: POINT } });
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Schließen' });
    const apply = within(dialog).getByRole('button', { name: 'Übernehmen' });
    apply.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(apply).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(submitted).not.toHaveBeenCalled();
  });
});
