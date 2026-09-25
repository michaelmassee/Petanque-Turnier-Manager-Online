import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { EMPTY_REGISTRATION_FORM, REGISTRATION_STATUSES } from '../lib/constants.js';
import { labelFor, registrationPayload, translatedOptions } from '../lib/domain.js';
import { filterRegistrations } from '../frontend-core.js';
import { Feedback, SelectField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { RegistrationFields } from '../components/RegistrationFields.jsx';
import { formatMoney } from '../lib/format.js';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

export function RegistrationForm({ form, setForm, onSubmit, onCancel, tournaments, selectedTournamentId, manageMode, invalidField, saving = false }) {
  const { t } = useTranslation();
  const selectedValue = form.tournamentId || selectedTournamentId;
  const options = tournaments.map((tournament) => ({ value: tournament.id, label: tournament.name }));
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedValue);

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <SelectField label={t('Turnier')} value={selectedValue} onChange={(tournamentId) => setForm({ ...form, tournamentId })} options={options} />
      <RegistrationFields
        form={form}
        setForm={setForm}
        showStatus={manageMode}
        formation={selectedTournament?.formation}
        registrationType={selectedTournament?.registrationType}
        licenseRequired={selectedTournament?.licenseRequired}
        teamNameEnabled={selectedTournament?.teamNameEnabled}
        feeTiers={selectedTournament?.feeTiers}
        registrationQuestions={selectedTournament?.registrationQuestions}
        currency={selectedTournament?.currency}
        invalidField={invalidField}
      />
      <div className="dialog-actions">
        {onCancel && <Button variant="secondary" type="button" onClick={onCancel}>{t('Abbrechen')}</Button>}
        <Button type="submit" loading={saving}>{form.id ? t('Anmeldung speichern') : t('Anmeldung erfassen')}</Button>
      </div>
    </form>
  );
}

const REGISTRATION_CSV_COLUMNS = [
  'id',
  'firstName',
  'lastName',
  'email',
  'noEmail',
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
  'participation',
  'isVip',
  'feeSelections',
  'feeTotalCents',
  'registeredAt',
  'confirmedAt',
  'createdAt',
  'updatedAt',
  'organizerMessage',
];

function csvField(value) {
  if (Array.isArray(value)) {
    value = value.map((selection) => `${selection.name} (${selection.amountCents})`).join('; ');
  }
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

function registrationQuestionColumns(tournament, t) {
  const roles = ['primary', ...(tournament?.registrationType === 'forme' && tournament?.formation !== 'tete' ? ['partner'] : []), ...(tournament?.registrationType === 'forme' && tournament?.formation === 'triplette' ? ['partner2'] : [])];
  const roleLabels = { primary: t('Hauptspieler'), partner: t('Partner'), partner2: t('Partner 2') };
  return (tournament?.registrationQuestions || []).flatMap((question) => roles.map((participant) => ({
    key: `${question.id}:${participant}`,
    label: `${question.label} (${roleLabels[participant]})`,
  })));
}

export function registrationsToCsv(registrations, tournament, t) {
  const currency = tournament?.currency;
  const questionColumns = registrationQuestionColumns(tournament, t);
  const lines = [[...REGISTRATION_CSV_COLUMNS, ...questionColumns.map((column) => column.label)].map(csvField).join(',')];
  for (const registration of registrations) {
    const standardColumns = REGISTRATION_CSV_COLUMNS.map((column) => {
      if (column === 'feeSelections') return csvField((registration.feeSelections || []).map((selection) => `${selection.name} (${formatMoney(selection.amountCents, currency, 'de')})`).join('; '));
      if (column === 'feeTotalCents') return csvField(registration.feeSelections?.length ? formatMoney(registration.feeTotalCents, currency, 'de') : '');
      return csvField(registration[column]);
    });
    const questionValues = questionColumns.map((column) => csvField(
      (registration.registrationAnswers || []).some((answer) => `${answer.questionId}:${answer.participant}` === column.key) ? t('Ja') : t('Nein'),
    ));
    lines.push([...standardColumns, ...questionValues].join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

function tournamentFileSlug(name) {
  return (name || 'turnier')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'turnier';
}

function downloadRegistrationsCsv(tournament, registrations, t) {
  const csv = registrationsToCsv(registrations, tournament, t);
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

function registrationToForm(registration) {
  return {
    ...EMPTY_REGISTRATION_FORM,
    id: registration.id,
    tournamentId: registration.tournamentId,
    firstName: registration.firstName || '',
    lastName: registration.lastName || '',
    email: registration.email || '',
    noEmail: Boolean(registration.noEmail),
    club: registration.club || '',
    licenseNr: registration.licenseNr || '',
    partnerFirstName: registration.partnerFirstName || '',
    partnerLastName: registration.partnerLastName || '',
    partnerEmail: registration.partnerEmail || '',
    partnerLicenseNr: registration.partnerLicenseNr || '',
    partner2FirstName: registration.partner2FirstName || '',
    partner2LastName: registration.partner2LastName || '',
    partner2Email: registration.partner2Email || '',
    partner2LicenseNr: registration.partner2LicenseNr || '',
    feeSelections: registration.feeSelections || [],
    registrationAnswers: registration.registrationAnswers || [],
    teamName: registration.teamName || '',
    seedingPosition: registration.seedingPosition || '',
    status: registration.status || 'pending',
    isVip: Boolean(registration.isVip),
  };
}

function RegistrationRow({ registration, tournament, showConfirm = false, busy, busyOther, onConfirm, onEdit, onDelete }) {
  const { t } = useTranslation();
  const participantLabel = { primary: t('Hauptspieler'), partner: t('Partner'), partner2: t('Partner 2') };
  return (
    <article className="data-row">
      <div>
        <strong data-i18n-skip>
          {registration.isVip && <span className="vip-badge" title="VIP">★</span>}
          {registration.firstName} {registration.lastName}
        </strong>
        <span>{registration.noEmail ? t('ohne E-Mail-Adresse') : registration.email}</span>
        {registration.teamName && <small data-i18n-skip>{registration.teamName}</small>}
        {registration.organizerMessage && <small data-i18n-skip>{registration.organizerMessage}</small>}
        {registration.feeSelections?.length > 0 && <small data-i18n-skip>{registration.feeSelections.map((selection) => `${selection.name}: ${formatMoney(selection.amountCents, tournament?.currency, 'de')}`).join(' · ')}{registration.feeTotalCents ? ` = ${formatMoney(registration.feeTotalCents, tournament?.currency, 'de')}` : ''}</small>}
        {(tournament?.registrationQuestions || []).map((question) => {
          const answers = (registration.registrationAnswers || []).filter((answer) => answer.questionId === question.id);
          return answers.length > 0 ? <small key={question.id}><span data-i18n-skip>{question.label}</span>: {answers.map((answer) => participantLabel[answer.participant]).join(', ')}</small> : null;
        })}
      </div>
      <span className={`status registration-${registration.status}`}>{labelFor(REGISTRATION_STATUSES, registration.status)}</span>
      <div className="row-actions">
        {showConfirm && (
          <Button loading={busy === `confirm-${registration.id}`} disabled={Boolean(busyOther)} onClick={() => onConfirm(registration)}>
            {t('Bestätigen')}
          </Button>
        )}
        <Button variant="secondary" disabled={Boolean(busy)} onClick={() => onEdit(registration)}>{t('Bearbeiten')}</Button>
        <Button variant="danger" loading={busy === `delete-${registration.id}`} disabled={Boolean(busyOther)} onClick={() => onDelete(registration)}>{t('Löschen')}</Button>
      </div>
    </article>
  );
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
  busyId,
  message,
  error,
}) {
  const { t } = useTranslation();
  const filtered = Boolean(query.trim()) || Boolean(statusFilter);
  const pendingRegistrations = filteredRegistrations.filter((registration) => registration.status === 'pending');
  const otherRegistrations = filteredRegistrations.filter((registration) => registration.status !== 'pending');
  const visiblePendingRegistrations = useInfiniteList(pendingRegistrations);
  const visibleOtherRegistrations = useInfiniteList(otherRegistrations);

  function rowProps(registration) {
    const busy = busyId === `confirm-${registration.id}` ? `confirm-${registration.id}` : busyId === `delete-${registration.id}` ? `delete-${registration.id}` : '';
    return { busy, busyOther: Boolean(busyId) && !busy };
  }

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Anmeldungen')}</h2>
        <span className="counter">{filtered ? `${filteredRegistrations.length}/${registrations.length}` : registrations.length}</span>
        <Button
          variant="secondary"
          disabled={registrations.length === 0}
          onClick={() => downloadRegistrationsCsv(tournament, registrations, t)}
        >
          {t('CSV exportieren')}
        </Button>
        <Button onClick={onCreate}>{t('Neue Anmeldung')}</Button>
      </div>
      <Feedback message={message} />
      <Feedback error={error} />
      <SelectField
        label={t('Turnier anzeigen')}
        value={tournament?.id || ''}
        onChange={onTournamentChange}
        options={tournaments.map((item) => ({ value: item.id, label: item.name }))}
      />
      {!tournament?.canManage && <p className="muted">{t('Für dieses Turnier sind Anmeldungen nur für Admins und zuständige Turnierleiter sichtbar.')}</p>}
      <ListToolbar
        query={query}
        onQueryChange={onQueryChange}
        searchPlaceholder={t('Name oder Team suchen')}
        filters={[
          { label: t('Status filtern'), value: statusFilter, onChange: onStatusFilterChange, options: [{ value: '', label: t('Alle Status') }, ...translatedOptions(REGISTRATION_STATUSES)] },
        ]}
        onReset={onResetFilters}
        resetDisabled={!filtered}
      />
      {pendingRegistrations.length > 0 && (
        <section className="user-list" aria-label={t('Offene Anmeldungen')}>
          <div className="section-title">
            <h3>{t('Offene Anmeldungen')}</h3>
            <span className="counter">{pendingRegistrations.length}</span>
            <Button loading={busyId === 'confirmAll'} disabled={Boolean(busyId) && busyId !== 'confirmAll'} onClick={onConfirmAll}>{t('Alle bestätigen')}</Button>
          </div>
          {visiblePendingRegistrations.items.map((registration) => (
            <RegistrationRow key={registration.id} registration={registration} tournament={tournament} showConfirm onConfirm={onConfirm} onEdit={onEdit} onDelete={onDelete} {...rowProps(registration)} />
          ))}
          <InfiniteListLoadMore hasMore={visiblePendingRegistrations.hasMore} onLoadMore={visiblePendingRegistrations.loadMore} label={t('Weitere Einträge laden')} />
        </section>
      )}
      {(otherRegistrations.length > 0 || (filteredRegistrations.length === 0 && pendingRegistrations.length === 0)) && (
        <section className="user-list" aria-label={t('Weitere Anmeldungen')}>
          {pendingRegistrations.length > 0 && <div className="section-title"><h3>{t('Weitere Anmeldungen')}</h3><span className="counter">{otherRegistrations.length}</span></div>}
          {visibleOtherRegistrations.items.map((registration) => (
            <RegistrationRow key={registration.id} registration={registration} tournament={tournament} onEdit={onEdit} onDelete={onDelete} {...rowProps(registration)} />
          ))}
          {filteredRegistrations.length === 0 && <p className="muted">{t('Keine Anmeldungen gefunden.')}</p>}
          <InfiniteListLoadMore hasMore={visibleOtherRegistrations.hasMore} onLoadMore={visibleOtherRegistrations.loadMore} label={t('Weitere Einträge laden')} />
        </section>
      )}
      {registrations.length > 0 && (
        <div className="registration-summary" aria-label={t('Zusammenfassung')}>
          <span className="registration-summary-item">
            <strong>{registrations.filter((registration) => registration.status === 'confirmed').length}</strong> {t('Angemeldet')}
          </span>
          <span className="registration-summary-item">
            <strong>{registrations.filter((registration) => registration.status === 'waitlist').length}</strong> {labelFor(REGISTRATION_STATUSES, 'waitlist')}
          </span>
          <span className="registration-summary-item registration-summary-total">
            <strong>{registrations.length}</strong> {t('Gesamt')}
          </span>
        </div>
      )}
    </div>
  );
}

export function RegistrationsManagementPage({
  tournaments = [],
  selectedTournamentId,
  setSelectedTournamentId,
  onTournamentsChanged,
  language,
  initialStatusFilter = '',
  onInitialStatusFilterConsumed,
}) {
  const { t } = useTranslation();
  const [registrations, setRegistrations] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_REGISTRATION_FORM);
  const [invalidField, setInvalidField] = useState(null);
  const [mode, setMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');

  const tournament = tournaments.find((item) => item.id === selectedTournamentId) || null;
  const manageMode = Boolean(tournament?.canManage);
  const manageableTournaments = useMemo(() => tournaments.filter((item) => item.canManage), [tournaments]);

  async function load(tournamentId) {
    if (!tournamentId) {
      setRegistrations([]);
      return;
    }
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournamentId}/registrations`);
      setRegistrations(data.registrations);
    } catch (err) { setError(err.message); }
  }

  useEffect(() => {
    if (manageMode) {
      load(tournament.id);
    } else {
      setRegistrations([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id, manageMode]);

  const filteredRegistrations = useMemo(
    () => filterRegistrations(registrations, query, statusFilter),
    [registrations, query, statusFilter],
  );

  useEffect(() => {
    if (initialStatusFilter) onInitialStatusFilterConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFeedback() {
    setError('');
    setMessage('');
    setInvalidField(null);
  }

  function openCreate() {
    setMode('create');
    setForm({ ...EMPTY_REGISTRATION_FORM, tournamentId: selectedTournamentId });
    clearFeedback();
    setDialogOpen(true);
  }

  function openEdit(registration) {
    setMode('edit');
    setForm(registrationToForm(registration));
    clearFeedback();
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setMode('create');
    setForm(EMPTY_REGISTRATION_FORM);
  }

  async function handleAdminSubmit(event) {
    event.preventDefault();
    setError(''); setMessage(''); setInvalidField(null);

    const tournamentId = form.tournamentId || selectedTournamentId;
    const payload = registrationPayload({ ...form, tournamentId }, language);

    setSaving(true);
    try {
      if (mode === 'edit') {
        await authenticatedApi(`/api/registrations/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage(t('Anmeldung wurde aktualisiert.'));
      } else {
        const result = await authenticatedApi(`/api/tournaments/${tournamentId}/registrations`, { method: 'POST', body: JSON.stringify(payload) });
        setMessage(`${t('Neue Meldung hinzugefügt:')} ${result.registration.firstName} ${result.registration.lastName}`);
      }
      closeDialog();
      await load(tournamentId);
      onTournamentsChanged?.();
    } catch (err) {
      const baseMessage = err.message;
      const conflictName = err.payload?.details?.name;
      setError(conflictName ? `${baseMessage} ("${conflictName}")` : baseMessage);
      setInvalidField(err.payload?.details?.field || null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(registration) {
    const registrationLabel = [registration.firstName, registration.lastName].filter(Boolean).join(' ') || registration.teamName;
    if (!window.confirm(`Anmeldung "${registrationLabel}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    setError(''); setMessage('');
    setBusyId(`delete-${registration.id}`);
    try {
      await authenticatedApi(`/api/registrations/${registration.id}`, { method: 'DELETE' });
      setMessage(t('Anmeldung wurde gelöscht.'));
      await load(registration.tournamentId);
      onTournamentsChanged?.();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function handleConfirm(registration) {
    setError(''); setMessage('');
    setBusyId(`confirm-${registration.id}`);
    try {
      const payload = registrationPayload({ ...registration, seedingPosition: registration.seedingPosition ?? '', status: 'confirmed' }, language);
      await authenticatedApi(`/api/registrations/${registration.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage(t('Anmeldung wurde bestätigt.'));
      await load(registration.tournamentId);
      onTournamentsChanged?.();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function handleConfirmAll() {
    if (!tournament) return;
    setError(''); setMessage('');
    setBusyId('confirmAll');
    try {
      const result = await authenticatedApi(`/api/tournaments/${tournament.id}/registrations/confirm-pending`, { method: 'POST' });
      setMessage(`${result.confirmedCount} ${t('offene Anmeldung(en) wurden bestätigt.')}`);
      await load(tournament.id);
      onTournamentsChanged?.();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  return (
    <>
      <RegistrationsPanel
        tournament={tournament}
        registrations={registrations}
        filteredRegistrations={filteredRegistrations}
        tournaments={manageableTournaments}
        onTournamentChange={setSelectedTournamentId}
        onCreate={openCreate}
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onResetFilters={() => { setQuery(''); setStatusFilter(''); }}
        onEdit={openEdit}
        onConfirm={handleConfirm}
        onConfirmAll={handleConfirmAll}
        onDelete={handleDelete}
        busyId={busyId}
        message={message}
        error={error}
      />

      <EditDialog
        open={dialogOpen}
        wide
        title={mode === 'edit' ? t('Anmeldung bearbeiten') : t('Anmeldung erfassen')}
        message={message}
        error={error}
        onClose={closeDialog}
      >
        <RegistrationForm
          form={form}
          setForm={setForm}
          onSubmit={handleAdminSubmit}
          onCancel={closeDialog}
          tournaments={manageableTournaments}
          selectedTournamentId={selectedTournamentId}
          manageMode={manageMode}
          invalidField={invalidField}
          saving={saving}
        />
      </EditDialog>
    </>
  );
}

export default RegistrationsManagementPage;
