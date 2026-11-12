import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, Feedback, TextField } from './ui.jsx';

// Rundenzeit-Timer wie im PTM-Hauptprojekt (TimerManager/TimerDialog/timer.html): Der Server speichert nur die Endzeit
// bzw. bei Pause die Restzeit, die Seiten zählen selbst herunter.
const TIMER_MAX_SECONDS = 99 * 60 + 59;
const DEFAULT_DURATION_SECONDS = 50 * 60;
const GONG_INTERVAL_MS = 5000;
// Unbeaufsichtigter Bildschirm: Der Gong hört spätestens nach drei Minuten von selbst auf.
const GONG_MAX_DURATION_MS = 3 * 60 * 1000;

export function formatTimerSeconds(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

// „MM:SS“ wie im Hauptprojekt; eine reine Zahl gilt als Minuten (bequemer am Handy). Ungültig → null.
export function parseTimerDuration(text) {
  const value = String(text ?? '').trim();
  let seconds = null;
  const mmss = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (mmss) seconds = Number(mmss[1]) * 60 + Number(mmss[2]);
  else if (/^\d{1,2}$/.test(value)) seconds = Number(value) * 60;
  return seconds && seconds > 0 && seconds <= TIMER_MAX_SECONDS ? seconds : null;
}

export function timerRemainingSeconds(timer, now = Date.now()) {
  if (!timer) return null;
  if (timer.state === 'paused') return Math.max(0, Number(timer.remainingSec) || 0);
  const endsAt = Date.parse(timer.endsAt);
  if (!Number.isFinite(endsAt)) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

// Restsekunden, die sich bei laufendem Timer selbst aktualisieren.
export function useTimerRemaining(timer) {
  const [now, setNow] = useState(() => Date.now());
  const running = timer?.state === 'running';
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [running, timer?.endsAt]);
  return timerRemainingSeconds(timer, running ? now : Date.now());
}

function timerPhase(timer, remaining) {
  if (timer.state === 'paused') return 'paused';
  return remaining > 0 ? 'running' : 'expired';
}

// Gong bei Ablauf, nur wenn der Ablauf in diesem offenen Tab erlebt wurde (nicht beim Laden eines längst abgelaufenen
// Timers). Browser spielen Ton erst nach einer Bedienung ab, daher „Ton aktivieren“.
function useGong(enabled, timer, expired) {
  const audioRef = useRef(null);
  const [soundOn, setSoundOn] = useState(false);
  const [soundError, setSoundError] = useState(false);
  const [ringing, setRinging] = useState(false);
  const seenRunningRef = useRef(false);
  const timerKey = timer ? `${timer.state}:${timer.endsAt || ''}` : '';

  useEffect(() => {
    seenRunningRef.current = Boolean(timer?.state === 'running' && !expired);
    setRinging(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey]);

  useEffect(() => {
    if (!expired) {
      if (timer?.state === 'running') seenRunningRef.current = true;
      return;
    }
    if (seenRunningRef.current) {
      seenRunningRef.current = false;
      setRinging(true);
    }
  }, [expired, timer?.state]);

  function play() {
    if (!audioRef.current) {
      audioRef.current = new Audio('/gong.wav');
      audioRef.current.preload = 'auto';
    }
    audioRef.current.currentTime = 0;
    return audioRef.current.play();
  }

  useEffect(() => {
    if (!enabled || !soundOn || !ringing) return undefined;
    const startedAt = Date.now();
    const ring = () => {
      if (Date.now() - startedAt > GONG_MAX_DURATION_MS) {
        setRinging(false);
        return;
      }
      play()?.catch?.(() => {});
    };
    ring();
    const interval = window.setInterval(ring, GONG_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, soundOn, ringing]);

  async function activate() {
    try {
      await play();
      setSoundOn(true);
      setSoundError(false);
    } catch {
      setSoundError(true);
    }
  }

  return { soundOn, soundError, ringing, activate, silence: () => setRinging(false) };
}

/**
 * Laufender Timer der Turnierleitung: groß auf der Turnierseite (mit Gong), kompakt in der Live-Ansicht und als
 * Vorschau im Timer-Panel. Grün läuft, Gelb pausiert, Rot blinkend abgelaufen – wie timer.html im Hauptprojekt.
 */
export function TimerBanner({ timer, size = 'compact', sound = false }) {
  const { t } = useTranslation();
  const remaining = useTimerRemaining(timer);
  const phase = timer && remaining !== null ? timerPhase(timer, remaining) : null;
  const gong = useGong(sound, timer, phase === 'expired');
  if (!timer || remaining === null) return null;
  const statusText = { running: t('Läuft'), paused: t('Pausiert'), expired: t('Zeit abgelaufen') }[phase];
  return (
    <section className={`timer-banner timer-${size} timer-${phase}`} aria-label={t('Rundenzeit')}>
      {timer.label && <p className="timer-banner-label" data-i18n-skip>{timer.label}</p>}
      <p className="timer-banner-time" data-i18n-skip>{formatTimerSeconds(remaining)}</p>
      <p className="timer-banner-status" role="status">{statusText}</p>
      {sound && (!gong.soundOn || (gong.ringing && phase === 'expired')) && (
        <div className="timer-banner-actions">
          {!gong.soundOn && (
            <button type="button" className={`timer-sound-button${gong.soundError ? ' is-error' : ''}`} onClick={gong.activate}>
              🔔 {t('Ton aktivieren')}
            </button>
          )}
          {gong.soundOn && gong.ringing && phase === 'expired' && (
            <button type="button" className="timer-sound-button" onClick={gong.silence}>🔕 {t('Gong aus')}</button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Turnierleitung: Rundenzeit starten, pausieren, um eine Minute ändern oder stoppen. Der Timer erscheint auf der
 * Turnierseite und in der Live-Ansicht; offene Seiten bekommen jede Änderung sofort.
 */
export function TimerEditor({ tournament }) {
  const { t } = useTranslation();
  // Die Turnierliste der Seite wird nicht neu geladen, daher den Stand hier selbst nachführen.
  const [timer, setTimer] = useState(tournament.timer || null);
  const [duration, setDuration] = useState(formatTimerSeconds(tournament.timerSettings?.durationSec || DEFAULT_DURATION_SECONDS));
  const [label, setLabel] = useState(tournament.timerSettings?.label || '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const durationSec = parseTimerDuration(duration);
  const remaining = useTimerRemaining(timer);
  const expired = timer?.state === 'running' && remaining === 0;

  useEffect(() => {
    setTimer(tournament.timer || null);
    setDuration(formatTimerSeconds(tournament.timerSettings?.durationSec || DEFAULT_DURATION_SECONDS));
    setLabel(tournament.timerSettings?.label || '');
    setError('');
    setMessage('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.id]);

  async function send(action, extra = {}, successMessage = '') {
    setError('');
    setMessage('');
    setBusy(action + (extra.deltaSec ? String(extra.deltaSec) : ''));
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/timer`, { method: 'PUT', body: JSON.stringify({ action, ...extra }) });
      setTimer(data.timer || null);
      if (successMessage) setMessage(successMessage);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  function start() {
    if (!durationSec) {
      setMessage('');
      setError(t('Bitte die Dauer im Format MM:SS angeben (höchstens 99:59).'));
      return;
    }
    send('start', { durationSec, label: label.trim() }, t('Timer gestartet.'));
  }

  function shiftDuration(deltaSec) {
    setDuration(formatTimerSeconds(Math.min(TIMER_MAX_SECONDS, Math.max(60, (durationSec || 0) + deltaSec))));
  }

  const active = Boolean(timer);
  return (
    <details className="panel timer-editor" open={active || undefined}>
      <summary>⏱ {t('Timer')}</summary>
      {active && (
        <>
          <TimerBanner timer={timer} />
          <div className="row-actions timer-editor-controls">
            <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'adjust-60'} onClick={() => send('adjust', { deltaSec: -60 })}>{t('−1 Minute')}</Button>
            <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'adjust60'} onClick={() => send('adjust', { deltaSec: 60 })}>{t('+1 Minute')}</Button>
            {timer.state === 'paused'
              ? <Button disabled={Boolean(busy)} loading={busy === 'resume'} onClick={() => send('resume')}>{t('Fortsetzen')}</Button>
              : !expired && <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'pause'} onClick={() => send('pause')}>{t('Anhalten')}</Button>}
            <Button variant="secondary" disabled={Boolean(busy)} loading={busy === 'stop'} onClick={() => send('stop', {}, t('Timer gestoppt.'))}>{t('Stoppen')}</Button>
          </div>
        </>
      )}
      <div className="timer-editor-fields">
        <div className="timer-editor-duration">
          <TextField label={t('Dauer (MM:SS)')} value={duration} onChange={setDuration} inputMode="numeric" maxLength={5}
            invalid={!durationSec} placeholder="50:00" />
          <Button variant="secondary" disabled={Boolean(busy)} onClick={() => shiftDuration(-60)} aria-label={t('Dauer um eine Minute verkürzen')}>−1</Button>
          <Button variant="secondary" disabled={Boolean(busy)} onClick={() => shiftDuration(60)} aria-label={t('Dauer um eine Minute verlängern')}>+1</Button>
        </div>
        <TextField label={t('Bezeichnung (optional)')} value={label} onChange={setLabel} maxLength={60} placeholder={t('z. B. Runde 3')} />
      </div>
      <p className="hint">{t('Erscheint groß auf der Turnierseite und in der Live-Ansicht. Die Turnierseite gongt bei Ablauf, sobald dort „Ton aktivieren“ angetippt wurde.')}</p>
      <div className="row-actions">
        <Button disabled={Boolean(busy) || !durationSec} loading={busy === 'start'} onClick={start}>{active ? t('Neu starten') : t('Timer starten')}</Button>
      </div>
      <Feedback error={error} />
      <Feedback message={message} />
    </details>
  );
}
