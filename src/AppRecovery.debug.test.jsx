import { fireEvent, render, screen } from '@testing-library/react';
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
    setDebugEnabled(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetDebugForTest();
    resetRecoveryForTest();
  });

  const messages = () => getDebugLog().map((entry) => `${entry.c}:${entry.m}`);

  it('protokolliert Ursache und Komponente, wenn ein manueller Neustart nötig ist, und zeigt beides im Bericht', () => {
    sessionStorage.setItem('ptm_app_recovery_attempt', JSON.stringify({ timestamp: Date.now() }));
    render(<><AppRecoveryBoundary><Boom /></AppRecoveryBoundary><DebugPanel /></>);

    expect(screen.getByText('Die App konnte nicht wiederhergestellt werden.')).toBeInTheDocument();
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
