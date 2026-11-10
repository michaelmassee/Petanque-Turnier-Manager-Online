import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './lib/i18next-config.js';
import { AppRecoveryBoundary } from './AppRecovery.jsx';
import { resetRecoveryForTest } from './app-recovery.js';
import { DebugPanel } from './components/DebugPanel.jsx';
import { debugReport, getDebugLog, resetDebugForTest, setDebugEnabled } from './lib/debug-log.js';

function Boom() {
  throw new Error('kaputt');
}

// React-Abstürze erreichen window.onerror nicht; die Fehlergrenze muss sie selbst ins Diagnoseprotokoll schreiben.
describe('Diagnoseprotokoll bei React-Abstürzen', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetDebugForTest();
    resetRecoveryForTest();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    setDebugEnabled(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    resetDebugForTest();
    resetRecoveryForTest();
  });

  const messages = () => getDebugLog().map((entry) => `${entry.c}:${entry.m}`);

  it('protokolliert Ursache und Komponente, wenn ein manueller Neustart nötig ist, und zeigt beides im Bericht', async () => {
    sessionStorage.setItem('ptm_app_recovery_attempt', JSON.stringify({ timestamp: Date.now() }));
    render(<><AppRecoveryBoundary><Boom /></AppRecoveryBoundary><DebugPanel /></>);

    expect(await screen.findByText('Die App konnte nicht wiederhergestellt werden.')).toBeInTheDocument();
    expect(messages()[0]).toMatch(/^error:React-Absturz: Error: kaputt \(.*Boom.*\)$/);
    expect(messages()).toContain('error:Wiederherstellung: manueller Neustart nötig');
    fireEvent.click(screen.getByRole('button', { name: /Diagnose/ }));
    expect(screen.getByRole('region', { name: 'Diagnose' })).toHaveTextContent('React-Absturz: Error: kaputt');
    expect(debugReport()).toMatch(/\[error\] React-Absturz: Error: kaputt/);
  });

  it('protokolliert auch offline, wo die Offline-Ansicht statt eines Neustarts erscheint', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<AppRecoveryBoundary><Boom /></AppRecoveryBoundary>);
    expect(screen.getByText('Die App ist offline nicht vollständig verfügbar.')).toBeInTheDocument();
    expect(messages()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^error:React-Absturz: Error: kaputt/),
      'error:Wiederherstellung: Offline-Ansicht',
    ]));
  });

  it('protokolliert ohne Schalter nichts', () => {
    setDebugEnabled(false);
    sessionStorage.setItem('ptm_app_recovery_attempt', JSON.stringify({ timestamp: Date.now() }));
    render(<AppRecoveryBoundary><Boom /></AppRecoveryBoundary>);
    expect(getDebugLog()).toEqual([]);
  });
});

describe('Wiederherstellung bei nicht erreichbarem Server', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetDebugForTest();
    resetRecoveryForTest();
    setDebugEnabled(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sessionStorage.clear();
    resetDebugForTest();
    resetRecoveryForTest();
  });

  it('zeigt statt einer Neustart-Schleife „Server nicht erreichbar“ und prüft per HEAD am Service Worker vorbei', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', fetchMock);

    render(<AppRecoveryBoundary><Boom /></AppRecoveryBoundary>);

    expect(await screen.findByText('Der Server ist gerade nicht erreichbar.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }));
    expect(getDebugLog().map((entry) => entry.m)).toContain('Wiederherstellung: Server nicht erreichbar');
    expect(sessionStorage.getItem('ptm_app_recovery_attempt')).toBeNull();
  });

  it('lädt neu, sobald der Server wieder antwortet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let serverUp = false;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!serverUp) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 200 });
    }));
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    render(<AppRecoveryBoundary><Boom /></AppRecoveryBoundary>);
    expect(await screen.findByText('Der Server ist gerade nicht erreichbar.')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();

    serverUp = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
