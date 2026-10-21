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

export function NumberIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3 9.2 8H5v2h3.9l-.6 4H4v2h3.9L7 21h2l.8-5h4L13 21h2l.8-5H20v-2h-3.9l.6-4H21V8h-4l.8-5h-2L15 8h-4l.8-5h-1.8zm.6 7h4l-.6 4h-4l.6-4z" />
    </svg>
  );
}

export function StarIcon({ size = 18, crossed = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" opacity={crossed ? 0.4 : 1} />
      {crossed && <path d="M3.4 2 22 20.6 20.6 22 2 3.4z" />}
    </svg>
  );
}

export function ClockIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
    </svg>
  );
}

export function SearchIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
    </svg>
  );
}

export function SortAlphaIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 4h2v12h3l-4 4-4-4h3V4zM6.6 4h1.8L12 14h-2l-.8-2.3H5.8L5 14H3L6.6 4zm-.2 6h2.2L7.5 6.8 6.4 10zM3.5 16H11v1.6L6 22h5v2H3.3v-1.6L8.6 18H3.5v-2z" transform="translate(0 -2)" />
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

export function TextArea({ label, value, onChange, onKeyDown, minLength, maxLength, required, rows = 4 }) {
  return (
    <label>
      {label}{maxLength ? ` (${value.length}/${maxLength})` : ''}
      {required ? <RequiredMark /> : null}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} rows={rows} minLength={minLength} maxLength={maxLength} required={required} />
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

// Teilt Titel und Link über das Teilen-Menü des Geräts, sonst per Zwischenablage; Rückmeldung direkt am Button.
// resolveUrl ermittelt den Link erst beim Klick (z. B. Freigabe-Link eines privaten Turniers).
export function ShareLinkButton({ title, url, resolveUrl }) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState({ message: '', error: '' });
  const [resolving, setResolving] = useState(false);

  async function share() {
    setFeedback({ message: '', error: '' });
    let target = url;
    if (resolveUrl) {
      setResolving(true);
      try {
        target = await resolveUrl();
      } catch (error) {
        setFeedback({ message: '', error: error.message });
        return;
      } finally {
        setResolving(false);
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, text: title, url: target });
      } else {
        if (!navigator.clipboard?.writeText) throw new Error();
        await navigator.clipboard.writeText(`${title}\n${target}`);
        setFeedback({ message: t('Link kopiert'), error: '' });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setFeedback({ message: '', error: t('Teilen wird von diesem Gerät nicht unterstützt') });
      }
    }
  }

  return <div>
    <Button variant="secondary" loading={resolving} onClick={share}><ShareIcon size={18} />{t('Teilen')}</Button>
    <Feedback message={feedback.message} error={feedback.error} />
  </div>;
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
