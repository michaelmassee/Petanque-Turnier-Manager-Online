import { Component, useEffect, useRef } from 'react';
import { Button } from './components/ui.jsx';
import i18next from './lib/i18next-config.js';
import { clearRecoveryAttempt, requestAppRestart } from './app-recovery.js';

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

export class AppRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { unrecoverable: false };
  }

  componentDidCatch() {
    if (requestAppRestart() === 'manual') this.setState({ unrecoverable: true });
  }

  render() {
    if (this.state.unrecoverable) return <RecoveryScreen />;
    return this.props.children;
  }
}
