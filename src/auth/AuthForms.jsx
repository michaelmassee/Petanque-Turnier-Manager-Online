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
  return (
    <div className="language-select" role="group" aria-label="Sprache">
      {LANGUAGE_FLAGS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`language-flag-button${option.value === language ? ' active' : ''}`}
          title={option.label}
          aria-label={option.label}
          aria-pressed={option.value === language}
          onClick={() => setLanguage(option.value)}
        >
          {option.flag}
        </button>
      ))}
    </div>
  );
}

export function SetupForm({ form, setForm, onSubmit }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Admin anlegen</Button>
    </form>
  );
}

export function LoginForm({ form, setForm, onSubmit, onGoogleLogin, onForgot, onRegister, onResendVerification }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
      <Button type="submit">Anmelden</Button>
      <button className="google-login-button" type="button" onClick={onGoogleLogin}>
        <span aria-hidden="true">G</span>
        Mit Google anmelden
      </button>
      <button className="link-button" type="button" onClick={onRegister}>
        Neu registrieren
      </button>
      <button className="link-button" type="button" onClick={onForgot}>
        Passwort vergessen?
      </button>
      <button className="link-button" type="button" onClick={onResendVerification}>
        Bestätigungs-E-Mail nicht erhalten?
      </button>
    </form>
  );
}

export function RegisterForm({ form, setForm, onSubmit, onBack, navigate }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <p className="hint">
        Mit der Registrierung stimmst du der Verarbeitung deiner Daten gemäß unserer Datenschutzerklärung zu.
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
        Datenschutzerklärung lesen
      </button>
      <Button type="submit">Registrieren</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

export function RegisterSuccessNotice({ onBack, onResendVerification }) {
  return (
    <div className="form">
      <p className="hint">
        {'Dein Benutzerkonto wurde angelegt. Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-E-Mail. Danach kannst du dich anmelden und eigene Turniere erstellen.'}
      </p>
      <Button type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </Button>
      <button className="link-button" type="button" onClick={onResendVerification}>
        Bestätigungs-E-Mail nicht erhalten?
      </button>
    </div>
  );
}

export function ForgotPasswordForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <Button type="submit">Reset-Link anfordern</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

export function ResendVerificationForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <Button type="submit">Bestätigungslink erneut senden</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

export function ResetPasswordForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Reset-Token" value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <TextField label="Neues Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Passwort ändern</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

export function VerifyEmailForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Bestätigungs-Token" value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <Button type="submit">E-Mail bestätigen</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

export function CancelRegistrationForm({ onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <Button type="submit" variant="danger">
        Anmeldung stornieren
      </Button>
      <button className="link-button" type="button" onClick={onBack}>
        Abbrechen
      </button>
    </form>
  );
}
