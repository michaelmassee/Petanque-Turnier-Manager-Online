import { DEFAULT_TOURNAMENT_LIMIT, DEFAULT_CALENDAR_ENTRY_LIMIT, ROLES, EMPTY_USER_FORM } from '../lib/constants.js';
import { PASSWORD_STRENGTH_HINT } from '../lib/format.js';
import { roleName } from '../lib/domain.js';
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
  const filtered = users.length !== totalUsers;
  const roleOptions = [{ value: '', label: 'Alle Rollen' }, ...ROLES];

  function resetUserFilters() {
    setUserQuery('');
    setUserRoleFilter('');
    setUserStatusFilter('');
  }

  return (
    <section className="user-management">
      <div className="user-management-header">
        <div>
          <h2>Benutzerverwaltung</h2>
          <p className="muted">Konten und Rollen zentral bearbeiten.</p>
        </div>
        <div className="user-stat-grid">
          <UserStat label="Benutzer" value={stats.total} />
          <UserStat label="Admins" value={stats.admins} />
          <UserStat label="E-Mail offen" value={stats.unverified} />
          <UserStat label="Passwortwechsel" value={stats.passwordChangeRequired} />
        </div>
      </div>

      <div className="panel user-list-panel">
        <div className="section-title">
          <h2>Benutzer</h2>
          <span className="counter">{filtered ? `${users.length}/${totalUsers}` : totalUsers}</span>
          <Button onClick={onCreateUser}>Neuer Benutzer</Button>
        </div>
        <ListToolbar
          query={userQuery}
          onQueryChange={setUserQuery}
          searchPlaceholder="Name oder E-Mail suchen"
          filters={[
            { label: 'Rolle filtern', value: userRoleFilter, onChange: setUserRoleFilter, options: roleOptions },
            { label: 'Status filtern', value: userStatusFilter, onChange: setUserStatusFilter, options: USER_STATUS_FILTERS },
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
          {users.length === 0 && <p className="muted">Keine Benutzer gefunden.</p>}
        </div>
      </div>

      <EditDialog
        open={dialogOpen}
        title={userMode === 'edit' ? 'Benutzer bearbeiten' : 'Benutzer anlegen'}
        onClose={onCloseDialog}
      >
        <UserEditorForm
          form={userForm}
          setForm={setUserForm}
          submitLabel={userMode === 'edit' ? 'Speichern' : 'Anlegen'}
          onSubmit={onSubmitUser}
          onCancel={onCloseDialog}
          passwordLabel={userMode === 'edit' ? 'Neues Passwort' : 'Passwort'}
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
  const systemUser = user.id === 'system-tournament-reports';

  return (
    <article className={`data-row user-row ${selected ? 'selected' : ''}`}>
      <div>
        <strong>{user.firstName} {user.lastName}</strong>
        <span>{user.email}</span>
      </div>
      <div className="badges">
        <span className={`role role-${user.role}`}>{roleName(user.role)}</span>
        <span className={user.emailVerifiedAt ? 'status registration-confirmed' : 'status registration-pending'}>
          {user.emailVerifiedAt ? 'E-Mail bestätigt' : 'E-Mail offen'}
        </span>
        {user.passwordChangeRequired && <span className="status registration-pending">Passwortwechsel nötig</span>}
        {user.role !== 'admin' && <span className="status">Turnier-Limit: {user.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT}</span>}
        {user.role !== 'admin' && <span className="status">Kalendereintrag-Limit: {user.calendarEntryLimit ?? DEFAULT_CALENDAR_ENTRY_LIMIT}</span>}
        {user.role !== 'admin' && (
          <span className={user.mailEnabled ? 'status registration-confirmed' : 'status registration-pending'}>
            {user.mailEnabled ? 'E-Mail-Versand freigeschaltet' : 'E-Mail-Versand gesperrt'}
          </span>
        )}
      </div>
      <div className="row-actions">
        <Button variant="secondary" onClick={() => onEdit(user)} disabled={systemUser}>
          Bearbeiten
        </Button>
        <Button variant="danger" onClick={() => onDelete(user)} disabled={systemUser || user.id === currentUser.id}>
          Löschen
        </Button>
      </div>
    </article>
  );
}

function UserEditorForm({ form, setForm, submitLabel, onSubmit, onCancel, passwordLabel, passwordRequired }) {
  return (
    <form className="form" onSubmit={onSubmit}>
      <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} />
      <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} />
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <SelectField label="Rolle" value={form.role} onChange={(role) => setForm({ ...form, role })} options={ROLES} />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.emailVerified}
          onChange={(event) => setForm({ ...form, emailVerified: event.target.checked })}
        />
        <span>E-Mail bestätigt setzen</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.passwordChangeRequired}
          onChange={(event) => setForm({ ...form, passwordChangeRequired: event.target.checked })}
        />
        <span>Passwortänderung beim nächsten Login erzwingen</span>
      </label>
      <TextField
        label="Turnier-Limit"
        type="number"
        min={0}
        value={form.tournamentLimit}
        onChange={(value) => setForm({ ...form, tournamentLimit: value === '' ? '' : Number(value) })}
      />
      <p className="hint">Maximale Anzahl eigener Turniere, die dieser Nutzer anlegen darf (Admins sind unbegrenzt).</p>
      <TextField
        label="Kalendereintrag-Limit"
        type="number"
        min={0}
        value={form.calendarEntryLimit}
        onChange={(value) => setForm({ ...form, calendarEntryLimit: value === '' ? '' : Number(value) })}
      />
      <p className="hint">Maximale Anzahl eigener Kalendereinträge, die dieser Nutzer anlegen darf (Admins sind unbegrenzt).</p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={form.mailEnabled}
          onChange={(event) => setForm({ ...form, mailEnabled: event.target.checked })}
        />
        <span>E-Mail-Versand für Turniere dieses Nutzers freigeschaltet</span>
      </label>
      <p className="hint">Solange nicht freigeschaltet, werden für Turniere dieses Nutzers keine Bestätigungs-, Erinnerungs- oder Broadcast-Mails verschickt (Push/Postfach bleiben unberührt).</p>
      <TextField
        label={passwordLabel}
        type="password"
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        required={passwordRequired}
        minLength={passwordRequired ? 8 : undefined}
        placeholder={passwordRequired ? '' : 'Leer lassen, wenn unverändert'}
      />
      <p className="hint">{PASSWORD_STRENGTH_HINT}</p>
      <div className="dialog-actions">
        <Button variant="secondary" type="button" onClick={onCancel}>Abbrechen</Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

export default UserManagementPanel;
