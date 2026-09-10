import { REGISTRATION_STATUSES } from '../lib/constants.js';
import { translateText } from '../lib/i18n.js';
import { labelFor } from '../lib/domain.js';
import { SelectField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { RegistrationFields } from '../components/RegistrationFields.jsx';

export function RegistrationForm({ form, setForm, onSubmit, onCancel, tournaments, selectedTournamentId, manageMode, invalidField }) {
  const selectedValue = form.tournamentId || selectedTournamentId;
  const options = tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }));
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedValue);

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <SelectField label="Turnier" value={selectedValue} onChange={(tournamentId) => setForm({ ...form, tournamentId })} options={options} />
      <RegistrationFields
        form={form}
        setForm={setForm}
        showStatus={manageMode}
        formation={selectedTournament?.formation}
        registrationType={selectedTournament?.registrationType}
        licenseRequired={selectedTournament?.licenseRequired}
        teamNameEnabled={selectedTournament?.teamNameEnabled}
        invalidField={invalidField}
      />
      <div className="dialog-actions">
        {onCancel && <Button variant="secondary" type="button" onClick={onCancel}>Abbrechen</Button>}
        <Button type="submit">{form.id ? 'Anmeldung speichern' : 'Anmeldung erfassen'}</Button>
      </div>
    </form>
  );
}

const REGISTRATION_CSV_COLUMNS = [
  'id',
  'firstName',
  'lastName',
  'email',
  'club',
  'licenseNr',
  'partnerFirstName',
  'partnerLastName',
  'partnerEmail',
  'partnerLicenseNr',
  'partner2FirstName',
  'partner2LastName',
  'partner2Email',
  'partner2LicenseNr',
  'teamName',
  'seedingPosition',
  'status',
  'isVip',
  'registeredAt',
  'confirmedAt',
  'createdAt',
  'updatedAt',
];

function csvField(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet applications evaluate cells beginning with these characters as formulas,
  // even when the CSV field is quoted. Preserve participant input as literal text instead.
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function registrationsToCsv(registrations) {
  const lines = [REGISTRATION_CSV_COLUMNS.map(csvField).join(',')];
  for (const registration of registrations) {
    lines.push(REGISTRATION_CSV_COLUMNS.map((column) => csvField(registration[column])).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

function tournamentFileSlug(name) {
  return (name || 'turnier')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'turnier';
}

function downloadRegistrationsCsv(tournament, registrations) {
  const csv = registrationsToCsv(registrations);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `meldeliste-${tournamentFileSlug(tournament?.name)}-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function RegistrationsPanel({
  tournament,
  registrations,
  filteredRegistrations,
  tournaments,
  onTournamentChange,
  onCreate,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  onResetFilters,
  onEdit,
  onConfirm,
  onConfirmAll,
  onDelete,
  language = 'de',
}) {
  const filtered = filteredRegistrations.length !== registrations.length;
  const pendingRegistrations = filteredRegistrations.filter((registration) => registration.status === 'pending');
  const otherRegistrations = filteredRegistrations.filter((registration) => registration.status !== 'pending');

  function RegistrationRow({ registration, showConfirm = false }) {
    return (
      <article className="data-row" key={registration.id}>
        <div>
          <strong>
            {registration.isVip && <span className="vip-badge" title="VIP">★</span>}
            {registration.firstName} {registration.lastName}
          </strong>
          <span>{registration.noEmail ? translateText('ohne E-Mail-Adresse', language) : registration.email}</span>
          {registration.teamName && <small>{registration.teamName}</small>}
        </div>
        <span className={`status registration-${registration.status}`}>{labelFor(REGISTRATION_STATUSES, registration.status)}</span>
        <div className="row-actions">
          {showConfirm && <Button onClick={() => onConfirm(registration)}>{translateText('Bestätigen', language)}</Button>}
          <Button variant="secondary" onClick={() => onEdit(registration)}>Bearbeiten</Button>
          <Button variant="danger" onClick={() => onDelete(registration)}>Löschen</Button>
        </div>
      </article>
    );
  }

  return (
    <div className="panel">
      <div className="section-title">
        <h2>Anmeldungen</h2>
        <span className="counter">{filtered ? `${filteredRegistrations.length}/${registrations.length}` : registrations.length}</span>
        <Button
          variant="secondary"
          disabled={registrations.length === 0}
          onClick={() => downloadRegistrationsCsv(tournament, registrations)}
        >
          CSV exportieren
        </Button>
        <Button onClick={onCreate}>Neue Anmeldung</Button>
      </div>
      <SelectField
        label="Turnier anzeigen"
        value={tournament?.id || ''}
        onChange={onTournamentChange}
        options={tournaments.map((item) => ({ value: item.id, label: item.name }))}
      />
      {!tournament?.canManage && <p className="muted">Für dieses Turnier sind Anmeldungen nur für Admins und zuständige Turnierleiter sichtbar.</p>}
      <ListToolbar
        query={query}
        onQueryChange={onQueryChange}
        searchPlaceholder="Name oder Team suchen"
        filters={[
          { label: 'Status filtern', value: statusFilter, onChange: onStatusFilterChange, options: [{ value: '', label: 'Alle Status' }, ...REGISTRATION_STATUSES] },
        ]}
        onReset={onResetFilters}
        resetDisabled={!filtered}
      />
      {pendingRegistrations.length > 0 && (
        <section className="user-list" aria-label={translateText('Offene Anmeldungen', language)}>
          <div className="section-title"><h3>{translateText('Offene Anmeldungen', language)}</h3><span className="counter">{pendingRegistrations.length}</span><Button onClick={onConfirmAll}>{translateText('Alle bestätigen', language)}</Button></div>
          {pendingRegistrations.map((registration) => <RegistrationRow key={registration.id} registration={registration} showConfirm />)}
        </section>
      )}
      {(otherRegistrations.length > 0 || (filteredRegistrations.length === 0 && pendingRegistrations.length === 0)) && (
        <section className="user-list" aria-label={translateText('Weitere Anmeldungen', language)}>
          {pendingRegistrations.length > 0 && <div className="section-title"><h3>{translateText('Weitere Anmeldungen', language)}</h3><span className="counter">{otherRegistrations.length}</span></div>}
          {otherRegistrations.map((registration) => <RegistrationRow key={registration.id} registration={registration} />)}
          {filteredRegistrations.length === 0 && <p className="muted">Keine Anmeldungen gefunden.</p>}
        </section>
      )}
    </div>
  );
}

export function RegistrationsManagementPage({
  tournament,
  registrations,
  filteredRegistrations,
  tournaments,
  onTournamentChange,
  onCreate,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  onResetFilters,
  onEdit,
  onConfirm,
  onConfirmAll,
  onDelete,
  language,
  registrationDialogOpen,
  registrationMode,
  registrationForm,
  setRegistrationForm,
  onRegistrationSubmit,
  onCloseRegistrationDialog,
  manageableTournaments,
  selectedTournamentId,
  manageMode,
  invalidField,
}) {
  return (
    <>
      <RegistrationsPanel
        tournament={tournament}
        registrations={registrations}
        filteredRegistrations={filteredRegistrations}
        tournaments={tournaments}
        onTournamentChange={onTournamentChange}
        onCreate={onCreate}
        query={query}
        onQueryChange={onQueryChange}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        onResetFilters={onResetFilters}
        onEdit={onEdit}
        onConfirm={onConfirm}
        onConfirmAll={onConfirmAll}
        onDelete={onDelete}
        language={language}
      />

      <EditDialog
        open={registrationDialogOpen}
        wide
        title={registrationMode === 'edit' ? 'Anmeldung bearbeiten' : 'Anmeldung erfassen'}
        onClose={onCloseRegistrationDialog}
      >
        <RegistrationForm
          form={registrationForm}
          setForm={setRegistrationForm}
          onSubmit={onRegistrationSubmit}
          onCancel={onCloseRegistrationDialog}
          tournaments={manageableTournaments}
          selectedTournamentId={selectedTournamentId}
          manageMode={manageMode}
          invalidField={invalidField}
        />
      </EditDialog>
    </>
  );
}

export default RegistrationsManagementPage;
