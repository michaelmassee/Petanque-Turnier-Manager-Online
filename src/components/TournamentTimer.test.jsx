import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { formatTimerSeconds, parseTimerDuration, TimerBanner, TimerEditor } from './TournamentTimer.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));

const NOW = Date.parse('2099-09-28T10:00:00.000Z');

describe('Rundenzeit-Timer (Frontend)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    authenticatedApi.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('liest MM:SS und reine Minuten, lehnt Ungültiges ab', () => {
    expect(parseTimerDuration('50:00')).toBe(3000);
    expect(parseTimerDuration('5:30')).toBe(330);
    expect(parseTimerDuration('45')).toBe(2700);
    expect(parseTimerDuration('0:00')).toBeNull();
    expect(parseTimerDuration('10:60')).toBeNull();
    expect(parseTimerDuration('100:00')).toBeNull();
    expect(formatTimerSeconds(3599)).toBe('59:59');
  });

  it('zählt einen laufenden Timer herunter und zeigt den Ablauf', () => {
    const timer = { state: 'running', label: 'Runde 2', endsAt: new Date(NOW + 2000).toISOString() };
    render(<TimerBanner timer={timer} />);
    expect(screen.getByText('00:02')).toBeTruthy();
    expect(screen.getByText('Runde 2')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByText('Zeit abgelaufen')).toBeTruthy();
  });

  it('zeigt einen pausierten Timer mit fester Restzeit', () => {
    render(<TimerBanner timer={{ state: 'paused', label: '', remainingSec: 754 }} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.getByText('Pausiert')).toBeTruthy();
  });

  it('startet den Timer mit Dauer und Bezeichnung und zeigt danach die Steuerung', async () => {
    authenticatedApi.mockResolvedValue({ timer: { state: 'running', label: 'Runde 1', endsAt: new Date(NOW + 600000).toISOString() } });
    render(<TimerEditor tournament={{ id: 't1', timer: null, timerSettings: { label: 'Runde 1', durationSec: 600 } }} />);

    expect(screen.getByLabelText('Dauer (MM:SS)').value).toBe('10:00');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Timer starten' })); });

    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/t1/timer', { method: 'PUT', body: JSON.stringify({ action: 'start', durationSec: 600, label: 'Runde 1' }) });
    expect(screen.getByText('Timer gestartet.')).toBeTruthy();
    expect(screen.getByText('10:00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anhalten' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neu starten' })).toBeTruthy();
  });

  it('meldet eine ungültige Dauer und sperrt den Start', () => {
    render(<TimerEditor tournament={{ id: 't1', timer: null }} />);
    fireEvent.change(screen.getByLabelText('Dauer (MM:SS)'), { target: { value: '7:99' } });
    expect(screen.getByRole('button', { name: 'Timer starten' }).disabled).toBe(true);
    expect(authenticatedApi).not.toHaveBeenCalled();
  });

  it('zeigt Serverfehler über Feedback', async () => {
    authenticatedApi.mockRejectedValue(new Error('Der Timer läuft nicht.'));
    render(<TimerEditor tournament={{ id: 't1', timer: { state: 'running', label: '', endsAt: new Date(NOW + 60000).toISOString() } }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Anhalten' })); });
    expect(screen.getByRole('alert').textContent).toContain('Der Timer läuft nicht.');
  });
});
