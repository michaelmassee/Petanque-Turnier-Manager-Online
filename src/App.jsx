import { useEffect, useMemo, useState } from 'react';

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
  { value: 'turnierleiter', label: 'Turnierleiter' },
];

const EMPTY_USER_FORM = {
  id: '',
  name: '',
  email: '',
  role: 'user',
  password: '',
};

const EMPTY_AUTH_FORM = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: '',
  token: '',
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authView, setAuthView] = useState('login');
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [authForm, setAuthForm] = useState(EMPTY_AUTH_FORM);
  const [mode, setMode] = useState('create');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get('reset_token');
    if (resetToken) {
      setAuthView('reset');
      setAuthForm((previous) => ({ ...previous, token: resetToken }));
    }
    initialize();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function initialize() {
    setLoading(true);
    setError('');

    try {
      const bootstrap = await api('/api/bootstrap');
      setNeedsSetup(bootstrap.needsSetup);

      if (!bootstrap.needsSetup) {
        try {
          const session = await api('/api/session');
          setCurrentUser(session.user);
        } catch {
          setCurrentUser(null);
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await api('/api/users');
      setUsers(data.users);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    try {
      const data = await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      setCurrentUser(data.user);
      setNeedsSetup(false);
      setAuthForm(EMPTY_AUTH_FORM);
      setMessage('Admin wurde angelegt.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      setCurrentUser(data.user);
      setAuthForm(EMPTY_AUTH_FORM);
      setMessage('Angemeldet.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await api('/api/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email }),
      });
      setMessage(data.resetUrl ? `${data.message} ${data.resetUrl}` : data.message);
      setAuthForm(EMPTY_AUTH_FORM);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (authForm.password !== authForm.passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    try {
      await api('/api/password/reset', {
        method: 'POST',
        body: JSON.stringify({
          token: authForm.token,
          password: authForm.password,
        }),
      });
      window.history.replaceState({}, '', window.location.pathname);
      setAuthForm(EMPTY_AUTH_FORM);
      setAuthView('login');
      setMessage('Passwort wurde geändert. Du kannst dich jetzt anmelden.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleLogout() {
    await api('/api/logout', { method: 'POST' });
    setCurrentUser(null);
    setUsers([]);
    setUserForm(EMPTY_USER_FORM);
    setMode('create');
    setMessage('');
    setError('');
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = { ...userForm };
    if (mode === 'edit' && !payload.password) {
      delete payload.password;
    }

    try {
      if (mode === 'edit') {
        await api(`/api/users/${userForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage('Benutzer wurde aktualisiert.');
      } else {
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage('Benutzer wurde angelegt.');
      }

      setUserForm(EMPTY_USER_FORM);
      setMode('create');
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleDelete(user) {
    setError('');
    setMessage('');

    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' });
      setMessage('Benutzer wurde gelöscht.');
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function editUser(user) {
    setMode('edit');
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: '',
    });
    setError('');
    setMessage('');
  }

  const roleLabel = useMemo(
    () => ROLES.find((role) => role.value === currentUser?.role)?.label || currentUser?.role,
    [currentUser],
  );

  if (loading) {
    return <AuthShell title="Petanque Turnier Manager Online" subtitle="Benutzerverwaltung wird geladen." />;
  }

  if (!currentUser) {
    return (
      <AuthShell
        title={authTitle(needsSetup, authView)}
        subtitle={authSubtitle(needsSetup, authView)}
      >
        {needsSetup && (
          <SetupForm form={authForm} setForm={setAuthForm} onSubmit={handleSetup} />
        )}

        {!needsSetup && authView === 'login' && (
          <LoginForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleLogin}
            onForgot={() => {
              setAuthView('forgot');
              setMessage('');
              setError('');
            }}
          />
        )}

        {!needsSetup && authView === 'forgot' && (
          <ForgotPasswordForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleForgotPassword}
            onBack={() => {
              setAuthView('login');
              setMessage('');
              setError('');
            }}
          />
        )}

        {!needsSetup && authView === 'reset' && (
          <ResetPasswordForm
            form={authForm}
            setForm={setAuthForm}
            onSubmit={handleResetPassword}
            onBack={() => {
              setAuthView('login');
              setMessage('');
              setError('');
            }}
          />
        )}

        <Feedback message={message} error={error} />
      </AuthShell>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Petanque Turnier Manager Online</p>
          <h1>Benutzerverwaltung</h1>
        </div>
        <div className="account">
          <span>{currentUser.name}</span>
          <strong>{roleLabel}</strong>
          <Button variant="secondary" onClick={handleLogout}>
            Abmelden
          </Button>
        </div>
      </header>

      {!isAdmin && (
        <section className="panel">
          <h2>Dashboard</h2>
          <p className="muted">
            Du bist als {roleLabel} angemeldet. Die Benutzerverwaltung ist nur für Admins sichtbar.
          </p>
        </section>
      )}

      {isAdmin && (
        <section className="admin-grid">
          <div className="panel">
            <div className="section-title">
              <h2>{mode === 'edit' ? 'Benutzer bearbeiten' : 'Benutzer anlegen'}</h2>
              {mode === 'edit' && (
                <Button variant="secondary" onClick={() => {
                  setMode('create');
                  setUserForm(EMPTY_USER_FORM);
                }}>
                  Neu
                </Button>
              )}
            </div>
            <UserEditorForm
              form={userForm}
              setForm={setUserForm}
              submitLabel={mode === 'edit' ? 'Speichern' : 'Anlegen'}
              onSubmit={handleUserSubmit}
              passwordLabel={mode === 'edit' ? 'Neues Passwort' : 'Passwort'}
              passwordRequired={mode === 'create'}
            />
            <Feedback message={message} error={error} />
          </div>

          <div className="panel">
            <div className="section-title">
              <h2>Benutzer</h2>
              <span className="counter">{users.length}</span>
            </div>
            <div className="user-list">
              {users.map((user) => (
                <article className="user-row" key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <span className={`role role-${user.role}`}>{roleName(user.role)}</span>
                  <div className="row-actions">
                    <Button variant="secondary" onClick={() => editUser(user)}>
                      Bearbeiten
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(user)} disabled={user.id === currentUser.id}>
                      Löschen
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function AuthShell({ title, subtitle, children }) {
  return (
    <main className="page">
      <section className="auth-panel" aria-labelledby="page-title">
        <p className="eyebrow">Petanque Turnier Manager Online</p>
        <h1 id="page-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}

function SetupForm({ form, setForm, onSubmit }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Admin anlegen</Button>
    </form>
  );
}

function LoginForm({ form, setForm, onSubmit, onForgot }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <TextField label="Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required />
      <Button type="submit">Anmelden</Button>
      <button className="link-button" type="button" onClick={onForgot}>
        Passwort vergessen?
      </button>
    </form>
  );
}

function ForgotPasswordForm({ form, setForm, onSubmit, onBack }) {
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

function ResetPasswordForm({ form, setForm, onSubmit, onBack }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Reset-Token" value={form.token} onChange={(token) => setForm({ ...form, token })} required />
      <TextField label="Neues Passwort" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} required minLength={8} />
      <TextField label="Passwort bestätigen" type="password" value={form.passwordConfirm} onChange={(passwordConfirm) => setForm({ ...form, passwordConfirm })} required minLength={8} />
      <Button type="submit">Passwort ändern</Button>
      <button className="link-button" type="button" onClick={onBack}>
        Zurück zur Anmeldung
      </button>
    </form>
  );
}

function UserEditorForm({ form, setForm, submitLabel, onSubmit, passwordLabel, passwordRequired }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <SelectField label="Rolle" value={form.role} onChange={(role) => setForm({ ...form, role })} options={ROLES} />
      <TextField
        label={passwordLabel}
        type="password"
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        required={passwordRequired}
        minLength={passwordRequired ? 8 : undefined}
        placeholder={passwordRequired ? '' : 'Leer lassen, wenn unverändert'}
      />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function TextField({ label, value, onChange, type = 'text', ...props }) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Button({ children, type = 'button', variant = 'primary', ...props }) {
  return (
    <button type={type} className={`button button-${variant}`} {...props}>
      {children}
    </button>
  );
}

function Feedback({ message, error }) {
  if (!message && !error) {
    return null;
  }

  return <p className={error ? 'feedback error' : 'feedback success'}>{error || message}</p>;
}

function authTitle(needsSetup, authView) {
  if (needsSetup) {
    return 'Ersten Admin anlegen';
  }
  if (authView === 'forgot') {
    return 'Passwort vergessen';
  }
  if (authView === 'reset') {
    return 'Passwort ändern';
  }
  return 'Anmelden';
}

function authSubtitle(needsSetup, authView) {
  if (needsSetup) {
    return 'Lege den ersten Admin-Benutzer für dieses neue Projekt an.';
  }
  if (authView === 'forgot') {
    return 'Fordere einen Link zum Zurücksetzen deines Passworts an.';
  }
  if (authView === 'reset') {
    return 'Setze mit deinem Reset-Token ein neues Passwort.';
  }
  return 'Melde dich mit deinem Benutzerkonto an.';
}

function roleName(value) {
  return ROLES.find((role) => role.value === value)?.label || value;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}
