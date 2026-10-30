import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LIVE_SOCKET_PING_MS, useTournamentLiveSocket } from './hooks.js';
import { FakeWebSocket, installFakeWebSocket, latestSocket, uninstallFakeWebSocket } from '../test-support/fake-websocket.js';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useTournamentLiveSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeWebSocket();
  });
  afterEach(() => {
    uninstallFakeWebSocket();
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('meldet die Verbindung, hält sie mit Ping offen und lädt bei "changed" gestreut neu', () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useTournamentLiveSocket('/api/tournaments/t1/schedule/socket', refresh));
    expect(result.current).toBe(false);
    act(() => latestSocket().open());
    expect(result.current).toBe(true);
    // Erstes Verbinden: einmal nachladen, falls sich seit dem Abruf schon etwas geändert hat.
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(LIVE_SOCKET_PING_MS); });
    expect(latestSocket().sent).toEqual(['ping']);

    act(() => { latestSocket().receive({ type: 'changed' }); latestSocket().receive({ type: 'changed' }); });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(refresh).toHaveBeenCalledTimes(2);
    // Zweiter Abruf, falls der Edge-Cache eines anderen Rechenzentrums noch den alten Stand hatte.
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('teilt sich eine Verbindung je Pfad und schließt sie mit dem letzten Zuhörer', () => {
    const first = renderHook(() => useTournamentLiveSocket('/api/x/socket', vi.fn()));
    const second = renderHook(() => useTournamentLiveSocket('/api/x/socket', vi.fn()));
    expect(FakeWebSocket.instances).toHaveLength(1);
    first.unmount();
    expect(latestSocket().readyState).toBe(0);
    second.unmount();
    expect(latestSocket().readyState).toBe(3);
  });

  it('verbindet nach einem Abbruch neu und lädt dann einmal nach, weil eine Änderung verpasst sein kann', () => {
    const refresh = vi.fn();
    renderHook(() => useTournamentLiveSocket('/api/y/socket', refresh));
    act(() => latestSocket().open());
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => latestSocket().drop());
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => latestSocket().open());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('gibt ohne erfolgreiche Verbindung nach einigen Versuchen auf und bleibt beim Polling', () => {
    renderHook(() => useTournamentLiveSocket('/api/z/socket', vi.fn()));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      act(() => latestSocket().drop());
      act(() => { vi.advanceTimersByTime(120_000); });
    }
    expect(FakeWebSocket.instances).toHaveLength(5);
  });

  it('trennt im Hintergrund und verbindet beim Zurückkehren neu', () => {
    const { result } = renderHook(() => useTournamentLiveSocket('/api/v/socket', vi.fn()));
    act(() => latestSocket().open());
    act(() => setVisibility('hidden'));
    expect(latestSocket().readyState).toBe(3);
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => setVisibility('visible'));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('öffnet ohne Pfad keine Verbindung', () => {
    renderHook(() => useTournamentLiveSocket(null, vi.fn()));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
