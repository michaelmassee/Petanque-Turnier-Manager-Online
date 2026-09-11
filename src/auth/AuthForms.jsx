import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PASSWORD_STRENGTH_HINT } from '../lib/format.js';
import { TextField, Button } from '../components/ui.jsx';

export function AuthShell({ title, subtitle, children, language, setLanguage }) {
  return (
    <main className="page">
      <section className="auth-panel" aria-labelledby="page-title">
        <div className="language-bar">
          <LanguageSelect language={language} setLanguage={setLanguage} />
        </div>
        <img src="/icons/logo.png" alt="Pétanque Turnier Manager Online" className="app-icon" />
        <p className="eyebrow">Pétanque Turnier Manager Online</p>
        <h1 id="page-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

const LANGUAGE_FLAGS = [
  { value: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { value: 'nl', flag: '🇳🇱', label: 'Nederlands' },
  { value: 'en', flag: '🇬🇧', label: 'English' },
  { value: 'es', flag: '🇪🇸', label: 'Español' },
  { value: 'fr', flag: '🇫🇷', label: 'Français' },
];

export function LanguageSelect({ language, setLanguage }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectRef = useRef(null);
  const activeLanguage = LANGUAGE_FLAGS.find((option) => option.value === language) || LANGUAGE_FLAGS[0];

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!selectRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  return (
    <div className="language-select" ref={selectRef} role="group" aria-label={t('Sprache')}>
      <button
        type="button"
        className="language-flag-button active"
        title={activeLanguage.label}
        aria-label={`${t('Sprache')}: ${activeLanguage.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((visible) => !visible)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      >
        {activeLanguage.flag}
      </button>
      {open && (
        <div className="language-menu" role="menu" aria-label={t('Sprache')}>
          {LANGUAGE_FLAGS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`language-flag-button${option.value === language ? ' active' : ''}`}
          title={option.label}
          aria-label={option.label}
          role="menuitemradio"
          aria-checked={option.value === language}
          onClick={() => {
            setLanguage(option.value);
            setOpen(false);
          }}
        >
          {option.flag}
        </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SetupForm({ form, setForm, onSubmit }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('Vorname')} value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label={t('Nachname')} value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label={t('Passwort')} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label={t('Passwort bestätigen')} type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">{t('Admin anlegen')}</Button>
    </form>
  );
}

export function LoginForm({ form, setForm, onSubmit, onGoogleLogin, onForgot, onRegister, onResendVerification }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label={t('Passwort')} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
      <Button type="submit">{t('Anmelden')}</Button>
      <button className="google-login-button" type="button" onClick={onGoogleLogin}>
        <span aria-hidden="true">G</span>
        {t('Mit Google anmelden')}
      </button>
      <button className="link-button" type="button" onClick={onRegister}>
        {t('Neu registrieren')}
      </button>
      <button className="link-button" type="button" onClick={onForgot}>
        {t('Passwort vergessen?')}
      </button>
      <button className="link-button" type="button" onClick={onResendVerification}>
        {t('Bestätigungs-E-Mail nicht erhalten?')}
      </button>
    </form>
  );
}

export function RegisterForm({ form, setForm, onSubmit, onBack, navigate }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('Vorname')} value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label={t('Nachname')} value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label={t('Passwort')} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <p className="hint">{t(PASSWORD_STRENGTH_HINT)}</p>
      <TextField label={t('Passwort bestätigen')} type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <p className="hint">
        {t('Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.')}
      </p>
      <label className="website-field" aria-hidden="true">
        Website
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => setForm({ ...form, website: event.target.value })}
        />
      </label>
      <button className="link-button" type="button" onClick={() => navigate('/datenschutz')}>
        {t('Datenschutzerklärung lesen')}
      </button>
      <Button type="submit">{t('Registrieren')}</Button>
      <button className="link-button" type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung')}
      </button>
    </form>
  );
}

export function RegisterSuccessNotice({ onBack, onResendVerification }) {
  const { t } = useTranslation();
  return (
    <div className="form">
      <p className="hint">
        {t('Dein Benutzerkonto wurde angelegt. Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-E-Mail. Danach kannst du dich anmelden und eigene Turniere erstellen.')}
      </p>
      <Button type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung')}
      </Button>
      <button className="link-button" type="button" onClick={onResendVerification}>
        {t('Bestätigungs-E-Mail nicht erhalten?')}
      </button>
    </div>
  );
}

export function ForgotPasswordForm({ form, setForm, onSubmit, onBack }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <Button type="submit">{t('Reset-Link anfordern')}</Button>
      <button className="link-button" type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung')}
      </button>
    </form>
  );
}

export function ResendVerificationForm({ form, setForm, onSubmit, onBack }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <Button type="submit">{t('Bestätigungslink erneut senden')}</Button>
      <button className="link-button" type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung')}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ form, setForm, onSubmit, onBack }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('Reset-Token')} value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <TextField label={t('Neues Passwort')} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <p className="hint">{t(PASSWORD_STRENGTH_HINT)}</p>
      <TextField label={t('Passwort bestätigen')} type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">{t('Passwort ändern')}</Button>
      <button className="link-button" type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung')}
      </button>
    </form>
  );
}

export function VerifyEmailForm({ form, setForm, onSubmit, onBack }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('Bestätigungs-Token')} value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <Button type="submit">{t('E-Mail bestätigen')}</Button>
      <button className="link-button" type="button" onClick={onBack}>
        {t('Zurück zur Anmeldung')}
      </button>
    </form>
  );
}

export function CancelRegistrationForm({ onSubmit, onBack }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <Button type="submit" variant="danger">
        {t('Anmeldung stornieren')}
      </Button>
      <button className="link-button" type="button" onClick={onBack}>
        {t('Abbrechen')}
      </button>
    </form>
  );
}
