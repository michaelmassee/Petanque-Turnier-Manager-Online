import { useTranslation } from 'react-i18next';
import { DEFAULT_TOURNAMENT_LIMIT, ROLES, EMPTY_USER_FORM } from '../lib/constants.js';
import { PASSWORD_STRENGTH_HINT } from '../lib/format.js';
import { roleName, translatedOptions } from '../lib/domain.js';
import { SelectField, TextField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';

const USER_STATUS_FILTERS = [
  { value: '', label: 'Alle Status' },
  { value: 'verified', label: 'E-Mail bestätigt' },
  { value: 'unverified', label: 'E-Mail offen' },
  { value: 'password_change_required', label: 'Passwortwechsel nötig' },
];

export function UserManagementPanel({
  users,
  stats,
  totalUsers,
  userMode,
  currentUser,
  userForm,
  setUserForm,
  userQuery,
  setUserQuery,
  userRoleFilter,
  setUserRoleFilter,
  userStatusFilter,
  setUserStatusFilter,
  dialogOpen,
  onCloseDialog,
  onCreateUser,
  onSubmitUser,
  onEditUser,
  onDeleteUser,
}) {
  const { t } = useTranslation();
  const filtered = users.length !== totalUsers;
  const roleOptions = [{ value: '', label: t('Alle Rollen') }, ...translatedOptions(ROLES)];

  function resetUserFilters() {
    setUserQuery('');
    setUserRoleFilter('');
    setUserStatusFilter('');
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
          <span className="counter">{filtered ? `${users.length}/${totalUsers}` : totalUsers}</span>
          <Button onClick={onCreateUser}>{t('Neuer Benutzer')}</Button>
        </div>
        <ListToolbar
          query={userQuery}
          onQueryChange={setUserQuery}
          searchPlaceholder={t('Name oder E-Mail suchen')}
          filters={[
            { label: t('Rolle filtern'), value: userRoleFilter, onChange: setUserRoleFilter, options: roleOptions },
            { label: t('Status filtern'), value: userStatusFilter, onChange: setUserStatusFilter, options: translatedOptions(USER_STATUS_FILTERS) },
          ]}
          onReset={resetUserFilters}
          resetDisabled={!filtered}
        />
        <div className="user-list">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              currentUser={currentUser}
              selected={userMode === 'edit' && user.id === userForm.id}
              onEdit={onEditUser}
              onDelete={onDeleteUser}
            />
          ))}
          {users.length === 0 && <p className="muted">{t('Keine Benutzer gefunden.')}</p>}
        </div>
      </div>

      <EditDialog
        open={dialogOpen}
        title={userMode === 'edit' ? t('Benutzer bearbeiten') : t('Benutzer anlegen')}
        onClose={onCloseDialog}
      >
        <UserEditorForm
          form={userForm}
          setForm={setUserForm}
          submitLabel={userMode === 'edit' ? t('Speichern') : t('Anlegen')}
          onSubmit={onSubmitUser}
          onCancel={onCloseDialog}
          passwordLabel={userMode === 'edit' ? t('Neues Passwort') : t('Passwort')}
          passwordRequired={userMode === 'create'}
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

function UserRow({ user, currentUser, selected, onEdit, onDelete }) {
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
        <Button variant="secondary" onClick={() => onEdit(user)} disabled={systemUser}>
          {t('Bearbeiten')}
        </Button>
        <Button variant="danger" onClick={() => onDelete(user)} disabled={systemUser || user.id === currentUser.id}>
          {t('Löschen')}
        </Button>
      </div>
    </article>
  );
}

function UserEditorForm({ form, setForm, submitLabel, onSubmit, onCancel, passwordLabel, passwordRequired }) {
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
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

export default UserManagementPanel;
