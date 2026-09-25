import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { DEFAULT_TOURNAMENT_LIMIT, ROLES, EMPTY_USER_FORM } from '../lib/constants.js';
import { PASSWORD_STRENGTH_HINT, PASSWORD_STRENGTH_ERROR, isPasswordStrong } from '../lib/format.js';
import { roleName, translatedOptions } from '../lib/domain.js';
import { filterUsers } from '../frontend-core.js';
import { Feedback, SelectField, TextField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

const USER_STATUS_FILTERS = [
  { value: '', label: 'Alle Status' },
  { value: 'verified', label: 'E-Mail bestätigt' },
  { value: 'unverified', label: 'E-Mail offen' },
  { value: 'password_change_required', label: 'Passwortwechsel nötig' },
];

function userToForm(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    password: '',
    emailVerified: Boolean(user.emailVerifiedAt),
    passwordChangeRequired: Boolean(user.passwordChangeRequired),
    tournamentLimit: user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT,
    mailEnabled: user.mailEnabled ?? true,
  };
}

export function UserManagementPanel({ currentUser, tournaments = [], onTournamentsChanged }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [mode, setMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await authenticatedApi('/api/users');
      setUsers(data.users);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => filterUsers(users, query, roleFilter, statusFilter), [users, query, roleFilter, statusFilter]);
  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((user) => user.role === 'admin').length,
    unverified: users.filter((user) => !user.emailVerifiedAt).length,
    passwordChangeRequired: users.filter((user) => user.passwordChangeRequired).length,
  }), [users]);

  const roleOptions = [{ value: '', label: t('Alle Rollen') }, ...translatedOptions(ROLES)];
  const isFiltered = Boolean(query.trim()) || Boolean(roleFilter) || Boolean(statusFilter);
  const visibleUsers = useInfiniteList(filtered);

  function resetFilters() {
    setQuery('');
    setRoleFilter('');
    setStatusFilter('');
  }

  function openCreate() {
    setMode('create');
    setForm(EMPTY_USER_FORM);
    setError(''); setMessage('');
    setDialogOpen(true);
  }

  function openEdit(user) {
    setMode('edit');
    setForm(userToForm(user));
    setError(''); setMessage('');
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setMode('create');
    setForm(EMPTY_USER_FORM);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(''); setMessage('');

    const payload = { ...form };
    if (mode === 'edit' && !payload.password) {
      delete payload.password;
    }
    if (payload.password && !isPasswordStrong(payload.password)) {
      setError(t(PASSWORD_STRENGTH_ERROR));
      return;
    }

    setSaving(true);
    try {
      if (mode === 'edit') {
        await authenticatedApi(`/api/users/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage(t('Benutzer wurde aktualisiert.'));
      } else {
        await authenticatedApi('/api/users', { method: 'POST', body: JSON.stringify(payload) });
        setMessage(t('Benutzer wurde angelegt.'));
      }
      closeDialog();
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Benutzer "${user.firstName} ${user.lastName}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    const ownedTournaments = tournaments.filter((tournament) => tournament.ownerId === user.id);
    let deleteTournaments = false;
    if (ownedTournaments.length > 0) {
      deleteTournaments = window.confirm(
        `Dieser Benutzer besitzt ${ownedTournaments.length} Turnier(e). OK = diese Turniere ebenfalls löschen. Abbrechen = die Turniere werden dir als Admin zugewiesen und bleiben erhalten.`,
      );
    }

    setError(''); setMessage('');
    setBusyId(`delete-${user.id}`);
    try {
      await authenticatedApi(`/api/users/${user.id}${deleteTournaments ? '?deleteTournaments=true' : ''}`, { method: 'DELETE' });
      setMessage(t('Benutzer wurde gelöscht.'));
      await load();
      onTournamentsChanged?.();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  return (
    <section className="user-management">
      <div className="user-management-header">
        <div>
          <h2>{t('Benutzerverwaltung')}</h2>
          <p className="muted">{t('Konten und Rollen zentral bearbeiten.')}</p>
        </div>
        <div className="user-stat-grid">
          <UserStat label={t('Benutzer')} value={stats.total} />
          <UserStat label={t('Admins')} value={stats.admins} />
          <UserStat label={t('E-Mail offen')} value={stats.unverified} />
          <UserStat label={t('Passwortwechsel')} value={stats.passwordChangeRequired} />
        </div>
      </div>

      <div className="panel user-list-panel">
        <div className="section-title">
          <h2>{t('Benutzer')}</h2>
          <span className="counter">{isFiltered ? `${filtered.length}/${users.length}` : users.length}</span>
          <Button onClick={openCreate}>{t('Neuer Benutzer')}</Button>
        </div>
        <Feedback message={message} />
        <Feedback error={error} />
        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder={t('Name oder E-Mail suchen')}
          filters={[
            { label: t('Rolle filtern'), value: roleFilter, onChange: setRoleFilter, options: roleOptions },
            { label: t('Status filtern'), value: statusFilter, onChange: setStatusFilter, options: translatedOptions(USER_STATUS_FILTERS) },
          ]}
          onReset={resetFilters}
          resetDisabled={!isFiltered}
        />
        {loading ? <p className="muted">{t('Lädt …')}</p> : (
          <div className="user-list">
            {visibleUsers.items.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                currentUser={currentUser}
                selected={mode === 'edit' && user.id === form.id}
                busy={busyId === `delete-${user.id}`}
                busyOther={Boolean(busyId) && busyId !== `delete-${user.id}`}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
            {filtered.length === 0 && <p className="muted">{t('Keine Benutzer gefunden.')}</p>}
          </div>
        )}
        <InfiniteListLoadMore hasMore={visibleUsers.hasMore} onLoadMore={visibleUsers.loadMore} label={t('Weitere Einträge laden')} />
      </div>

      <EditDialog
        open={dialogOpen}
        title={mode === 'edit' ? t('Benutzer bearbeiten') : t('Benutzer anlegen')}
        message={message}
        error={error}
        onClose={closeDialog}
      >
        <UserEditorForm
          form={form}
          setForm={setForm}
          submitLabel={mode === 'edit' ? t('Speichern') : t('Anlegen')}
          onSubmit={handleSubmit}
          onCancel={closeDialog}
          passwordLabel={mode === 'edit' ? t('Neues Passwort') : t('Passwort')}
          passwordRequired={mode === 'create'}
          saving={saving}
        />
      </EditDialog>
    </section>
  );
}

function UserStat({ label, value }) {
  return (
    <div className="user-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UserRow({ user, currentUser, selected, busy, busyOther, onEdit, onDelete }) {
  const { t } = useTranslation();
  const systemUser = user.id === 'system-tournament-reports';

  return (
    <article className={`data-row user-row ${selected ? 'selected' : ''}`}>
      <div>
        <strong data-i18n-skip>{user.firstName} {user.lastName}</strong>
        <span>{user.email}</span>
      </div>
      <div className="badges">
        <span className={`role role-${user.role}`}>{roleName(user.role)}</span>
        <span className={user.emailVerifiedAt ? 'status registration-confirmed' : 'status registration-pending'}>
          {user.emailVerifiedAt ? t('E-Mail bestätigt') : t('E-Mail offen')}
        </span>
        {user.passwordChangeRequired && <span className="status registration-pending">{t('Passwortwechsel nötig')}</span>}
        {user.role !== 'admin' && <span className="status">{t('Turnier-Limit:')} {user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT}</span>}
        {user.role !== 'admin' && (
          <span className={user.mailEnabled ? 'status registration-confirmed' : 'status registration-pending'}>
            {user.mailEnabled ? t('E-Mail-Versand freigeschaltet') : t('E-Mail-Versand gesperrt')}
          </span>
        )}
      </div>
      <div className="row-actions">
        <Button variant="secondary" onClick={() => onEdit(user)} disabled={systemUser || busy || busyOther}>
          {t('Bearbeiten')}
        </Button>
        <Button variant="danger" loading={busy} onClick={() => onDelete(user)} disabled={systemUser || user.id === currentUser.id || busyOther}>
          {t('Löschen')}
        </Button>
      </div>
    </article>
  );
}

function UserEditorForm({ form, setForm, submitLabel, onSubmit, onCancel, passwordLabel, passwordRequired, saving = false }) {
  const { t } = useTranslation();
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label={t('Vorname')} value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label={t('Nachname')} value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label={t('E-Mail')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <SelectField label={t('Rolle')} value={form.role} onChange={(role) => setForm({ ...form, role })} options={translatedOptions(ROLES)} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.emailVerified}
          onChange={(event) => setForm({ ...form, emailVerified: event.target.checked })}
        />
        <span>{t('E-Mail bestätigt setzen')}</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.passwordChangeRequired}
          onChange={(event) => setForm({ ...form, passwordChangeRequired: event.target.checked })}
        />
        <span>{t('Passwortänderung beim nächsten Login erzwingen')}</span>
      </label>
      <TextField
        label={t('Turnier-Limit')}
        type="number"
        min={0}
        value={form.tournamentLimit}
        onChange={(value) => setForm({ ...form, tournamentLimit: value === '' ? '' : Number(value) })}
      />
      <p className="hint">{t('Maximale Anzahl eigener Turniere, die dieser Nutzer anlegen darf (Admins sind unbegrenzt).')}</p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.mailEnabled}
          onChange={(event) => setForm({ ...form, mailEnabled: event.target.checked })}
        />
        <span>{t('E-Mail-Versand für Turniere dieses Nutzers freigeschaltet')}</span>
      </label>
      <p className="hint">{t('Solange nicht freigeschaltet, werden für Turniere dieses Nutzers keine Bestätigungs-, Erinnerungs- oder Broadcast-Mails verschickt (Push/Postfach bleiben unberührt).')}</p>
      <TextField
        label={passwordLabel}
        type="password"
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        required={passwordRequired}
        minLength={passwordRequired ? 8 : undefined}
        placeholder={passwordRequired ? '' : t('Leer lassen, wenn unverändert')}
      />
      <p className="hint">{t(PASSWORD_STRENGTH_HINT)}</p>
      <div className="dialog-actions">
        <Button variant="secondary" type="button" onClick={onCancel}>{t('Abbrechen')}</Button>
        <Button type="submit" loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export default UserManagementPanel;
