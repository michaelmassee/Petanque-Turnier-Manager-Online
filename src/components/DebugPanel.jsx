import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { clearDebugLog, debugDeviceInfo, debugReport, getDebugLog, isDebugEnabled, setDebugEnabled, subscribeDebugLog } from '../lib/debug-log.js';

const time = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Diagnose-Kasten (?debug=1): Gerätedaten und Ereignisprotokoll zum Kopieren, nur auf dem eigenen Gerät. Bewusst
// schlichte Buttons statt der Button-Komponente: alle Aktionen sind synchron (kein Lade-Feedback nötig).
export function DebugPanel() {
  const { t } = useTranslation();
  const enabled = useSyncExternalStore(subscribeDebugLog, isDebugEnabled);
  const entries = useSyncExternalStore(subscribeDebugLog, getDebugLog);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  // Fallback ohne Zwischenablage-Recht: Text zum manuellen Kopieren, unabhängig vom eingeklappten Zustand.
  const [manualText, setManualText] = useState('');
  const textRef = useRef(null);
  const bodyRef = useRef(null);
  // Neueste Einträge stehen unten: bei neuen Einträgen und beim Aufklappen ans Ende scrollen.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [entries, open, enabled]);
  useEffect(() => {
    if (manualText) textRef.current?.select();
  }, [manualText]);
  if (!enabled) return null;

  async function copy() {
    const report = debugReport();
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setManualText('');
    } catch {
      // Ohne Zwischenablage-Recht (z. B. ältere iOS-WebViews): Panel öffnen und Text zum manuellen Kopieren markieren.
      setOpen(true);
      setManualText(report);
    }
  }

  return (
    <section className="debug-panel" aria-label={t('Diagnose')}>
      <div className="debug-panel-head">
        <button type="button" className="debug-panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t('Diagnose')} <span data-i18n-skip>({entries.length})</span>
        </button>
        <div className="debug-panel-actions">
          <button type="button" onClick={copy}>{copied ? t('Kopiert.') : t('Kopieren')}</button>
          <button type="button" onClick={() => { clearDebugLog(); setCopied(false); setManualText(''); }}>{t('Leeren')}</button>
          <button type="button" onClick={() => setDebugEnabled(false)}>{t('Beenden')}</button>
        </div>
      </div>
      {open && (
        <div className="debug-panel-body" data-i18n-skip ref={bodyRef}>
          {debugDeviceInfo().map((line) => <div key={line} className="debug-panel-device">{line}</div>)}
          <ol className="debug-panel-log">
            {entries.map((entry, index) => (
              <li key={`${entry.t}-${index}`}><time>{time(entry.t)}</time> <b>{entry.c}</b> {entry.m}</li>
            ))}
          </ol>
        </div>
      )}
      {manualText && (
        <textarea ref={textRef} className="debug-panel-copy" readOnly value={manualText} aria-label={t('Kopieren')} data-i18n-skip />
      )}
    </section>
  );
}
