import { useState, useId, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function ShareIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
    </svg>
  );
}

export function DownloadIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 20h14v-2H5v2zm14-11h-4V3H9v6H5l7 7 7-7z" />
    </svg>
  );
}

export function RequiredMark() {
  return <span className="required-mark" aria-hidden="true"> *</span>;
}

export function TextField({ label, value, onChange, type = 'text', required, invalid, className, ...props }) {
  const { t } = useTranslation();
  const [passwordVisible, setPasswordVisible] = useState(false);

  if (type === 'password') {
    return (
      <label>
        {label}
        {required ? <RequiredMark /> : null}
        <div className="password-field">
          <input
            type={passwordVisible ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={required}
            {...props}
          />
          <button
            className="password-toggle"
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? t('Passwort verbergen') : t('Passwort anzeigen')}
          >
            {passwordVisible ? t('Verbergen') : t('Anzeigen')}
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className={invalid ? 'field-invalid-label' : undefined}>
      {label}
      {required ? <RequiredMark /> : null}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className={[className, invalid ? 'field-invalid' : ''].filter(Boolean).join(' ') || undefined}
        {...props}
      />
    </label>
  );
}

export function TextArea({ label, value, onChange, maxLength, required }) {
  return (
    <label>
      {label}{maxLength ? ` (${value.length}/${maxLength})` : ''}
      {required ? <RequiredMark /> : null}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} maxLength={maxLength} required={required} />
    </label>
  );
}

export function SelectField({ label, value, onChange, options, disabled, required }) {
  return (
    <label>
      {label}
      {required ? <RequiredMark /> : null}
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required={required}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Button({ children, type = 'button', variant = 'primary', loading = false, disabled, onClick, ...props }) {
  const [clickPending, setClickPending] = useState(false);
  const pending = loading || clickPending;

  function handleClick(event) {
    const result = onClick?.(event);
    if (!result || typeof result.then !== 'function') return result;
    setClickPending(true);
    Promise.resolve(result).then(
      () => setClickPending(false),
      () => setClickPending(false),
    );
    return result;
  }

  return (
    <button
      type={type}
      className={`button button-${variant}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={onClick ? handleClick : undefined}
      {...props}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Feedback({ message, error }) {
  const ref = useRef(null);

  // The action button is often far below the message (long dialogs on phones),
  // so bring a new message into view instead of leaving the click without visible effect.
  // `scroll-margin` on .feedback keeps it below the sticky top bar.
  useEffect(() => {
    if (error || message) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [error, message]);

  if (!message && !error) {
    return null;
  }

  return (
    <p ref={ref} className={error ? 'feedback error' : 'feedback success'} role={error ? 'alert' : 'status'}>
      {error || message}
    </p>
  );
}

export function DistanceBadge({ distanceKm }) {
  const { t } = useTranslation();

  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return null;
  }

  return (
    <span className="distance-badge">
      <span aria-hidden="true">📍</span>
      <strong>{Math.round(distanceKm)} {t('km entfernt')}</strong>
    </span>
  );
}

// 👤 hinter einem Namen: Die Person ist mit einem Benutzerkonto verknüpft.
export function AccountBadge() {
  const { t } = useTranslation();
  return <span className="account-badge" title={t('Mit Benutzerkonto verbunden')} aria-label={t('Mit Benutzerkonto verbunden')}>👤</span>;
}

export function ClubBadge({ clubName, clubKind = 'club', onClick }) {
  const { t } = useTranslation();
  const isIndependent = !clubName;
  const label = isIndependent ? 'Bouleplatz ohne Verein/Gruppe' : clubKind === 'group' ? 'Gruppe' : 'Verein';
  const icon = isIndependent ? '📍' : clubKind === 'group' ? '👥' : '🏛';

  return (
    <span className={`club-badge club-badge-${isIndependent ? 'independent' : clubKind}${onClick ? ' club-badge-clickable' : ''}`} title={clubName || t(label)} onClick={onClick}>
      <span aria-hidden="true">{icon}</span>
      <strong>{t(label)}</strong>
    </span>
  );
}

export function ListToolbar({ query, onQueryChange, searchPlaceholder, filters = [], onReset, resetDisabled }) {
  const { t } = useTranslation();
  return (
    <div className="user-toolbar">
      <input
        type="search"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {filters.map((filter) => (
        <SelectField key={filter.label} label={filter.label} value={filter.value} onChange={filter.onChange} options={filter.options} />
      ))}
      <Button variant="secondary" onClick={onReset} disabled={resetDisabled}>
        {t('Filter zurücksetzen')}
      </Button>
    </div>
  );
}

export function CloseButton({ onClick, className = '' }) {
  const { t } = useTranslation();
  return (
    <button className={`close-icon-button${className ? ` ${className}` : ''}`} type="button" onClick={onClick} aria-label={t('Schließen')} title={t('Schließen')}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </button>
  );
}

export function EditDialog({ open = true, title, subtitle, message, error, onClose, wide, nested, children }) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className={`modal-backdrop${nested ? ' modal-backdrop--nested' : ''}`} onClick={onClose}>
      <div
        className={`modal-panel${wide ? ' modal-panel--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <CloseButton onClick={onClose} />
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        <Feedback message={message} error={error} />
        {children}
      </div>
    </div>
  );
}
