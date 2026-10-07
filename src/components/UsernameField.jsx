import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { normalizeUsername, usernameProblem } from '../lib/username.js';
import { TextField } from './ui.jsx';

const PROBLEM_TEXTS = {
  invalid: '3 bis 30 Zeichen: a–z, 0–9 sowie . _ - (nicht am Anfang oder Ende)',
  reserved: 'Dieser Benutzername ist nicht erlaubt',
  offensive: 'Dieser Benutzername ist nicht erlaubt',
};

// Eingabe des Benutzernamens mit Live-Prüfung (Format sofort, Verfügbarkeit verzögert per API).
// currentUsername: eigener, bereits vergebener Name – gilt als verfügbar.
export function UsernameField({ value, onChange, currentUsername = null, required, disabled, hint }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const normalized = normalizeUsername(value);
  const localProblem = normalized ? usernameProblem(normalized) : '';

  useEffect(() => {
    setStatus(null);
    if (!normalized || localProblem || normalized === currentUsername) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await api(`/api/username-available?u=${encodeURIComponent(normalized)}`);
        if (!cancelled) setStatus({ ...result, username: normalized });
      } catch {
        // Ohne Verbindung prüft der Server beim Speichern.
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalized, localProblem, currentUsername]);

  let state = null;
  if (localProblem) state = <p className="hint field-hint-error">{t(PROBLEM_TEXTS[localProblem])}</p>;
  else if (status?.username === normalized && status.available) state = <p className="hint field-hint-ok">{t('Benutzername ist verfügbar')}</p>;
  else if (status?.username === normalized && status.problem === 'taken') {
    state = (
      <p className="hint field-hint-error">
        {t('Benutzername bereits vergeben')}
        {status.suggestion && (
          <>
            {' · '}
            <button className="link-button" type="button" onClick={() => onChange(status.suggestion)}>
              {t('Vorschlag übernehmen: @{{username}}', { username: status.suggestion })}
            </button>
          </>
        )}
      </p>
    );
  } else if (status?.username === normalized && status.problem) state = <p className="hint field-hint-error">{t(PROBLEM_TEXTS[status.problem] || PROBLEM_TEXTS.invalid)}</p>;

  return (
    <div className="username-field">
      <TextField
        label={t('Benutzername')}
        value={value}
        onChange={(next) => onChange(next.replace(/\s+/g, '').toLowerCase())}
        required={required}
        disabled={disabled}
        invalid={Boolean(localProblem) || status?.available === false}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={3}
        maxLength={31}
      />
      {state}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
