import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { ensureBrowserPushSubscription, isPushSupported } from '../lib/push.js';
import { Button, Feedback } from './ui.jsx';

const MESSAGE_VISIBLE_MS = 5000;

function flagKey(tournamentId) {
  return `ptm_board_push_${tournamentId}`;
}

function readFlag(tournamentId) {
  try {
    return localStorage.getItem(flagKey(tournamentId));
  } catch {
    return null;
  }
}

function writeFlag(tournamentId) {
  try {
    localStorage.setItem(flagKey(tournamentId), '1');
  } catch {
    // Merker ist nur Komfort; ohne Speicher zeigt der Button wieder "aktivieren".
  }
}

/**
 * Sofort-Aktualisierung der Turnierseite bzw. Bildschirm-Anzeige: abonniert einen stillen Web-Push für dieses
 * Turnier (ohne Meldung oder Konto). Bei jeder neuen Runde und Ankündigung lädt die offene Seite dann sofort neu
 * (Service Worker → "live-update"), statt bis zum nächsten Abruf nach 2 Minuten zu warten.
 */
export function BoardPushToggle({ tournamentId, shareToken = '', language }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const supported = isPushSupported();
  // Ohne VAPID-Schlüssel auf dem Server (z. B. lokale Entwicklung) gibt es keinen Push: Button gar nicht erst zeigen.
  const [publicKey, setPublicKey] = useState(null);
  const path = `/api/tournaments/${encodeURIComponent(tournamentId)}/schedule/push${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`;

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    api('/api/live/push/public-key')
      .then((data) => { if (!cancelled) setPublicKey(data.publicKey || ''); })
      .catch(() => { if (!cancelled) setPublicKey(''); });
    return () => { cancelled = true; };
  }, [supported]);

  async function subscribe() {
    const result = await ensureBrowserPushSubscription(async () => publicKey);
    if (result.status === 'blocked') throw new Error(t('Benachrichtigungen sind im Browser blockiert. Bitte in den Browser-Einstellungen erlauben.'));
    if (result.status !== 'enabled') throw new Error(t('Benachrichtigungen wurden nicht erlaubt.'));
    await api(path, { method: 'POST', body: JSON.stringify({ ...result.subscription.toJSON(), language, url: window.location.href }) });
  }

  // Einmal eingeschaltet, bleibt es nach dem Neuladen an (z. B. Bildschirm vor Ort); das Abo wird dabei aufgefrischt.
  useEffect(() => {
    // Anderes Turnier: Zustand des vorherigen nicht übernehmen, nur das eigene Abo (falls gemerkt) zählt.
    setEnabled(false);
    setError('');
    setMessage('');
    if (!publicKey || readFlag(tournamentId) !== '1' || Notification.permission !== 'granted') return undefined;
    let cancelled = false;
    subscribe()
      .then(() => { if (!cancelled) setEnabled(true); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, publicKey]);

  // Die Bestätigung nur kurz zeigen: Auf dem Bildschirm vor Ort soll sie nicht dauerhaft stehen bleiben.
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), MESSAGE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!supported || !publicKey) return null;
  // Einmal an, bleibt es an (auch nach dem Neuladen); ausschalten lässt es sich über die Benachrichtigungs-Einstellungen
  // des Browsers. Dann nur noch die kurze Bestätigung bzw. Fehler zeigen.
  if (enabled && !error && !message) return null;

  async function enable() {
    setError(''); setMessage(''); setBusy(true);
    try {
      await subscribe();
      writeFlag(tournamentId);
      setEnabled(true);
      setMessage(t('Diese Seite aktualisiert sich jetzt bei jeder neuen Runde sofort.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board-push">
      {!enabled && (
        <Button variant="secondary" loading={busy} onClick={enable} title={t('Lädt diese Seite bei jeder neuen Runde sofort neu. Dafür muss der Browser Benachrichtigungen erlauben.')}>{t('Push einschalten')}</Button>
      )}
      <Feedback error={error} />
      <Feedback message={message} />
    </div>
  );
}
