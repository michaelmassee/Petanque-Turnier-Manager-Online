import { Component, useEffect, useRef } from 'react';
import { Button } from './components/ui.jsx';
import i18next from './lib/i18next-config.js';
import { clearRecoveryAttempt, requestAppRestart, shouldAttemptAutomaticRecovery } from './app-recovery.js';

function recoveryText(key) {
  return i18next.t(key);
}

export function RecoveryScreen() {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function restartManually() {
    clearRecoveryAttempt();
    window.location.reload();
  }

  return <main className="app-recovery" role="alert">
    <section className="app-recovery-panel">
      <h1 ref={headingRef} tabIndex={-1}>{recoveryText('Die App konnte nicht wiederhergestellt werden.')}</h1>
      <p>{recoveryText('Bitte starte die App erneut.')}</p>
      <Button onClick={restartManually}>{recoveryText('App neu starten')}</Button>
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

export class AppRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { unrecoverable: false, offline: typeof navigator !== 'undefined' && !navigator.onLine };
    this.updateConnectivity = this.updateConnectivity.bind(this);
  }

  componentDidMount() {
    window.addEventListener('online', this.updateConnectivity);
    window.addEventListener('offline', this.updateConnectivity);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.updateConnectivity);
    window.removeEventListener('offline', this.updateConnectivity);
  }

  updateConnectivity() {
    this.setState({ offline: !navigator.onLine });
  }

  componentDidCatch() {
    // Ein fehlender Lazy-Load-Chunk oder eine nicht erreichbare API ist offline
    // kein Grund zum Neustart: der Reload würde denselben Fehler sofort erneut
    // auslösen. Stattdessen bleibt die verständliche Offline-Ansicht stehen.
    if (!shouldAttemptAutomaticRecovery()) {
      this.setState({ unrecoverable: true, offline: true });
      return;
    }
    if (requestAppRestart() === 'manual') this.setState({ unrecoverable: true });
  }

  render() {
    if (this.state.unrecoverable) return this.state.offline ? <OfflineRecoveryScreen /> : <RecoveryScreen />;
    return this.props.children;
  }
}
