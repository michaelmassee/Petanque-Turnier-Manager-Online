import { useState, useId } from 'react';

export function RequiredMark() {
  return <span className="required-mark" aria-hidden="true"> *</span>;
}

export function TextField({ label, value, onChange, type = 'text', required, ...props }) {
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
            aria-label={passwordVisible ? 'Passwort verbergen' : 'Passwort anzeigen'}
          >
            {passwordVisible ? 'Verbergen' : 'Anzeigen'}
          </button>
        </div>
      </label>
    );
  }

  return (
    <label>
      {label}
      {required ? <RequiredMark /> : null}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
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

export function Button({ children, type = 'button', variant = 'primary', ...props }) {
  return (
    <button type={type} className={`button button-${variant}`} {...props}>
      {children}
    </button>
  );
}

export function Feedback({ message, error }) {
  if (!message && !error) {
    return null;
  }

  return <p className={error ? 'feedback error' : 'feedback success'}>{error || message}</p>;
}

export function ListToolbar({ query, onQueryChange, searchPlaceholder, filters = [], onReset, resetDisabled }) {
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
        Filter zurücksetzen
      </Button>
    </div>
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
        <button className="modal-close" type="button" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        <Feedback message={message} error={error} />
        {children}
      </div>
    </div>
  );
}
