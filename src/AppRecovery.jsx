import { Component, useEffect, useRef } from 'react';
import { Button } from './components/ui.jsx';
import i18next from './lib/i18next-config.js';
import { clearRecoveryAttempt, isServerReachable, requestAppRestart, shouldAttemptAutomaticRecovery } from './app-recovery.js';
import { debugLog } from './lib/debug-log.js';

function recoveryText(key) {
  return i18next.t(key);
}

function restartNow() {
  clearRecoveryAttempt();
  window.location.reload();
}

export function RecoveryScreen() {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return <main className="app-recovery" role="alert">
    <section className="app-recovery-panel">
      <h1 ref={headingRef} tabIndex={-1}>{recoveryText('Die App konnte nicht wiederhergestellt werden.')}</h1>
      <p>{recoveryText('Bitte starte die App erneut.')}</p>
      <Button onClick={restartNow}>{recoveryText('App neu starten')}</Button>
    </section>
  </main>;
}

export function OfflineRecoveryScreen() {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return <main className="app-recovery" role="alert">
    <section className="app-recovery-panel">
      <h1 ref={headingRef} tabIndex={-1}>{recoveryText('Die App ist offline nicht vollständig verfügbar.')}</h1>
      <p>{recoveryText('Bitte stelle eine Internetverbindung her und versuche es dann erneut.')}</p>
    </section>
  </main>;
}

const SERVER_RETRY_MS = 5_000;

export function ServerUnreachableScreen({ onRetry, checking = false }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return <main className="app-recovery" role="alert">
    <section className="app-recovery-panel">
      <h1 ref={headingRef} tabIndex={-1}>{recoveryText('Der Server ist gerade nicht erreichbar.')}</h1>
      <p>{recoveryText('Die App lädt automatisch neu, sobald er wieder antwortet.')}</p>
      <Button onClick={onRetry} loading={checking}>{recoveryText('Erneut versuchen')}</Button>
    </section>
  </main>;
}

// Zustände nach einem Absturz: checking (Server wird geprüft), reloading (automatischer Neustart läuft),
// manual (Neustart-Knopf), offline (Gerät ohne Netz), server (Gerät online, Server antwortet nicht).
export class AppRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { mode: null, checking: false };
    this.handleOnline = this.handleOnline.bind(this);
    this.retryServer = this.retryServer.bind(this);
    this.retryTimer = null;
    this.unmounted = false;
  }

  static getDerivedStateFromError() {
    return { mode: 'checking' };
  }

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
  }

  componentWillUnmount() {
    this.unmounted = true;
    window.removeEventListener('online', this.handleOnline);
    clearTimeout(this.retryTimer);
  }

  handleOnline() {
    if (this.state.mode === 'offline' || this.state.mode === 'server') this.retryServer();
  }

  componentDidCatch(error, info) {
    // Diagnose (?debug=1): React-Abstürze erreichen window.onerror nicht, daher hier die Ursache festhalten –
    // vor einem möglichen automatischen Neustart, damit sie im Protokoll erhalten bleibt.
    const component = String(info?.componentStack || '').split('\n').map((line) => line.trim()).find(Boolean);
    debugLog('error', `React-Absturz: ${error?.name || 'Error'}: ${error?.message || error}${component ? ` (${component})` : ''}`);
    // Ein fehlender Lazy-Load-Chunk oder eine nicht erreichbare API ist offline
    // kein Grund zum Neustart: der Reload würde denselben Fehler sofort erneut
    // auslösen. Stattdessen bleibt die verständliche Offline-Ansicht stehen.
    if (!shouldAttemptAutomaticRecovery()) {
      debugLog('error', 'Wiederherstellung: Offline-Ansicht');
      this.setState({ mode: 'offline' });
      return;
    }
    // Gerät online, aber der Server antwortet nicht: ein Neustart lädt nur die zwischengespeicherte Startseite
    // und scheitert am selben fehlenden Modul. Erst warten, bis der Server wieder da ist.
    isServerReachable().then((reachable) => {
      if (this.unmounted) return;
      if (!reachable) {
        debugLog('error', 'Wiederherstellung: Server nicht erreichbar');
        this.setState({ mode: 'server' });
        this.scheduleServerRetry();
        return;
      }
      const restart = requestAppRestart();
      debugLog('error', `Wiederherstellung: ${restart === 'manual' ? 'manueller Neustart nötig' : 'automatischer Neustart'}`);
      this.setState({ mode: restart === 'manual' ? 'manual' : 'reloading' });
    });
  }

  scheduleServerRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(this.retryServer, SERVER_RETRY_MS);
  }

  async retryServer() {
    if (this.state.checking) return;
    clearTimeout(this.retryTimer);
    this.setState({ checking: true });
    const reachable = shouldAttemptAutomaticRecovery() && await isServerReachable();
    if (this.unmounted) return;
    if (reachable) {
      debugLog('error', 'Wiederherstellung: Server wieder erreichbar, Neustart');
      restartNow();
      return;
    }
    this.setState({ checking: false, mode: shouldAttemptAutomaticRecovery() ? 'server' : 'offline' });
    if (shouldAttemptAutomaticRecovery()) this.scheduleServerRetry();
  }

  render() {
    const { mode, checking } = this.state;
    if (!mode) return this.props.children;
    if (mode === 'offline') return <OfflineRecoveryScreen />;
    if (mode === 'server') return <ServerUnreachableScreen onRetry={this.retryServer} checking={checking} />;
    if (mode === 'manual') return <RecoveryScreen />;
    return null;
  }
}
