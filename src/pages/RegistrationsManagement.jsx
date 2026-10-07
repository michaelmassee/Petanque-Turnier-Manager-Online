import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { EMPTY_REGISTRATION_FORM, REGISTRATION_STATUSES } from '../lib/constants.js';
import { isCalendarEntry, labelFor, registrationPayload, translatedOptions } from '../lib/domain.js';
import { filterRegistrations } from '../frontend-core.js';
import { Feedback, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { RegistrationFields } from '../components/RegistrationFields.jsx';
import { TournamentPicker } from '../components/TournamentPicker.jsx';
import { formatMoney } from '../lib/format.js';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';

export function RegistrationForm({ form, setForm, onSubmit, onCancel, tournaments, selectedTournamentId, manageMode, invalidField, saving = false, currentUserId, clubNames }) {
  const { t } = useTranslation();
  const selectedValue = form.tournamentId || selectedTournamentId;
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedValue);

  return (
    <form className="form dense" onSubmit={onSubmit}>
      <TournamentPicker
        label={t('Turnier')}
        tournaments={tournaments}
        value={selectedValue}
        onChange={(tournamentId) => setForm({ ...form, tournamentId })}
        currentUserId={currentUserId}
      />
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
        clubNames={clubNames}
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
  'playerEmail',
  'noEmail',
  'club',
  'licenseNr',
  'partnerFirstName',
  'partnerLastName',
  'partnerEmail',
  'partnerClub',
  'partnerLicenseNr',
  'partner2FirstName',
  'partner2LastName',
  'partner2Email',
  'partner2Club',
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

const REGISTRATION_NAME_COLUMNS = [
  ['firstName', 'lastName'],
  ['partnerFirstName', 'partnerLastName'],
  ['partner2FirstName', 'partner2LastName'],
];

function hasPlayerName(registration, [firstNameKey, lastNameKey]) {
  return Boolean(registration[firstNameKey] || registration[lastNameKey]);
}

export function registrationsToCsv(registrations, tournament, t, { namesOnly = false, confirmedOnly = false } = {}) {
  const exportedRegistrations = confirmedOnly ? registrations.filter((registration) => registration.status === 'confirmed') : registrations;
  if (namesOnly) {
    // Eine Zeile pro Meldung: Teams stehen mit allen Spielern in derselben Zeile.
    const slotCount = Math.max(1, ...REGISTRATION_NAME_COLUMNS.map((slot, index) => (
      exportedRegistrations.some((registration) => hasPlayerName(registration, slot)) ? index + 1 : 0
    )));
    const nameColumns = REGISTRATION_NAME_COLUMNS.slice(0, slotCount).flat();
    const lines = [nameColumns.map(csvField).join(',')];
    exportedRegistrations.forEach((registration) => lines.push(nameColumns.map((column) => csvField(registration[column])).join(',')));
    return `﻿${lines.join('\r\n')}\r\n`;
  }
  const currency = tournament?.currency;
  const questionColumns = registrationQuestionColumns(tournament, t);
  const lines = [[...REGISTRATION_CSV_COLUMNS, ...questionColumns.map((column) => column.label)].map(csvField).join(',')];
  for (const registration of exportedRegistrations) {
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

function downloadRegistrationsCsv(tournament, registrations, t, options) {
  const csv = registrationsToCsv(registrations, tournament, t, options);
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
    // Ältere Anmeldungen kennen nur die frühere Kontakt-E-Mail; sie gilt jetzt als E-Mail von Spieler 1.
    playerEmail: registration.playerEmail || (registration.noEmail ? '' : registration.email || ''),
    noEmail: Boolean(registration.noEmail),
    club: registration.club || '',
    licenseNr: registration.licenseNr || '',
    partnerFirstName: registration.partnerFirstName || '',
    partnerLastName: registration.partnerLastName || '',
    partnerEmail: registration.partnerEmail || '',
    partnerClub: registration.partnerClub || '',
    partnerLicenseNr: registration.partnerLicenseNr || '',
    partner2FirstName: registration.partner2FirstName || '',
    partner2LastName: registration.partner2LastName || '',
    partner2Email: registration.partner2Email || '',
    partner2Club: registration.partner2Club || '',
    partner2LicenseNr: registration.partner2LicenseNr || '',
    feeSelections: registration.feeSelections || [],
    registrationAnswers: registration.registrationAnswers || [],
    teamName: registration.teamName || '',
    seedingPosition: registration.seedingPosition || '',
    status: registration.status || 'pending',
    isVip: Boolean(registration.isVip),
  };
}

function RegistrationDetails({ registration, tournament }) {
  const { t, i18n } = useTranslation();
  const participantLabel = { primary: t('Hauptspieler'), partner: t('Partner'), partner2: t('Partner 2') };
  const answersByQuestion = (tournament?.registrationQuestions || []).map((question) => ({
    ...question,
    participants: (registration.registrationAnswers || [])
      .filter((answer) => answer.questionId === question.id)
      .map((answer) => participantLabel[answer.participant])
      .filter(Boolean),
  })).filter((question) => question.participants.length > 0);
  const hasMessage = Boolean(registration.organizerMessage);
  const hasFees = registration.feeSelections?.length > 0;
  const hasAnswers = answersByQuestion.length > 0;

  if (!hasMessage && !hasFees && !hasAnswers) return null;

  return (
    <details className="registration-details">
      <summary>{t('Anmeldedetails anzeigen')}</summary>
      <div className="registration-details-content">
        {hasMessage && (
          <section>
            <h4>{t('Nachricht an die Turnierleitung')}</h4>
            <p data-i18n-skip>{registration.organizerMessage}</p>
          </section>
        )}
        {hasFees && (
          <section>
            <h4>{t('Gewählte Tarife')}</h4>
            <ul>
              {registration.feeSelections.map((selection, index) => (
                <li key={`${selection.participant || 'participant'}-${selection.tariffId || selection.name}-${index}`}>
                  {selection.participant && <span>{participantLabel[selection.participant]}: </span>}
                  <span data-i18n-skip>{selection.name}</span> – {formatMoney(selection.amountCents, tournament?.currency, i18n.language)}
                </li>
              ))}
            </ul>
            <p className="registration-details-total"><strong>{t('Gesamt')}:</strong> {formatMoney(registration.feeTotalCents || 0, tournament?.currency, i18n.language)}</p>
          </section>
        )}
        {hasAnswers && (
          <section>
            <h4>{t('Teilnehmerfragen')}</h4>
            <ul>
              {answersByQuestion.map((question) => (
                <li key={question.id}><span data-i18n-skip>{question.label}</span>: {question.participants.join(', ')}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}

function RegistrationRow({ registration, tournament, showConfirm = false, busy, busyOther, onConfirm, onEdit, onDelete }) {
  const { t } = useTranslation();
  const AccountBadge = () => <span className="account-badge" title={t('Mit Benutzerkonto verbunden')} aria-label={t('Mit Benutzerkonto verbunden')}>👤</span>;
  return (
    <article className="data-row">
      <div>
        <strong data-i18n-skip>
          {registration.isVip && <span className="vip-badge" title="VIP">★</span>}
          {registration.firstName} {registration.lastName}
          {registration.accountConnected && <AccountBadge />}
        </strong>
        <span>{registration.noEmail ? t('ohne E-Mail-Adresse') : registration.email}</span>
        {registration.club && <span className="registration-player-meta" data-i18n-skip>{registration.club}</span>}
        {registration.licenseNr && <span className="registration-player-meta" data-i18n-skip>{t('Lizenznummer')}: {registration.licenseNr}</span>}
        {registration.partnerFirstName && (
          <>
            <span className="registration-team-member" data-i18n-skip>
              {t('Partner')}: {registration.partnerFirstName} {registration.partnerLastName}
              {registration.partnerAccountConnected && <AccountBadge />}
            </span>
            {registration.partnerClub && <span className="registration-player-meta" data-i18n-skip>{registration.partnerClub}</span>}
            {registration.partnerLicenseNr && <span className="registration-player-meta" data-i18n-skip>{t('Lizenznummer')}: {registration.partnerLicenseNr}</span>}
          </>
        )}
        {registration.partner2FirstName && (
          <>
            <span className="registration-team-member" data-i18n-skip>
              {t('Partner 2')}: {registration.partner2FirstName} {registration.partner2LastName}
              {registration.partner2AccountConnected && <AccountBadge />}
            </span>
            {registration.partner2Club && <span className="registration-player-meta" data-i18n-skip>{registration.partner2Club}</span>}
            {registration.partner2LicenseNr && <span className="registration-player-meta" data-i18n-skip>{t('Lizenznummer')}: {registration.partner2LicenseNr}</span>}
          </>
        )}
        {registration.teamName && <small data-i18n-skip>{registration.teamName}</small>}
        {(registration.overCapacity || registration.receivedAfterStart || registration.accountConflict || registration.possibleDuplicate || registration.incomplete) && (
          <small className="registration-sync-flags">
            {registration.overCapacity && <span className="role">{t('über Kapazität')}</span>}
            {registration.receivedAfterStart && <span className="role role-user">{t('nach Turnierstart eingegangen')}</span>}
            {registration.accountConflict && <span className="role role-conflict" title={t('Dieselbe verknüpfte Person steht in mehreren Anmeldungen. Bitte eine davon stornieren oder die Person austauschen.')}>{t('Person doppelt angemeldet')}</span>}
            {registration.possibleDuplicate && <span className="role role-user" title={t('Gleicher Name oder gleiche E-Mail wie eine andere Anmeldung – nur ein Hinweis.')}>{t('mögliche Dublette')}</span>}
            {registration.incomplete && <span className="role role-user">{t('Team unvollständig')}</span>}
          </small>
        )}
        <RegistrationDetails registration={registration} tournament={tournament} />
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

function RelinkAccounts({ registration, busyId, onRelink }) {
  const { t } = useTranslation();
  if (!registration) return null;
  const slots = [
    { slot: 1, name: [registration.firstName, registration.lastName], email: registration.playerEmail, linked: registration.accountConnected },
    { slot: 2, name: [registration.partnerFirstName, registration.partnerLastName], email: registration.partnerEmail, linked: registration.partnerAccountConnected },
    { slot: 3, name: [registration.partner2FirstName, registration.partner2LastName], email: registration.partner2Email, linked: registration.partner2AccountConnected },
  ].filter((entry) => entry.name.some(Boolean) && entry.email);
  if (slots.length === 0) return null;
  return (
    <section className="relink-accounts" aria-label={t('Konto neu zuordnen')}>
      <h3>{t('Konto neu zuordnen')}</h3>
      <p className="hint">{t('Eine korrigierte E-Mail ändert ein bereits verknüpftes Konto nicht. Speichere zuerst die Korrektur und ordne dann das Konto der gespeicherten E-Mail ausdrücklich neu zu.')}</p>
      {slots.map((entry) => (
        <div className="row-actions" key={entry.slot}>
          <span data-i18n-skip>{entry.name.filter(Boolean).join(' ')} · {entry.email}{entry.linked ? ' 👤' : ''}</span>
          <Button variant="secondary" loading={busyId === `relink-${entry.slot}`} disabled={Boolean(busyId)} onClick={() => onRelink(registration, entry.slot)}>
            {t('Konto neu zuordnen')}
          </Button>
        </div>
      ))}
    </section>
  );
}

// "Live-Link neu senden" (EW-02): neuer persönlicher Link an die Spieler, der bisherige wird ungültig.
function LiveLinkResend({ registration, tournament, busyId, onResend }) {
  const { t } = useTranslation();
  if (!registration || !tournament?.liveViewEnabled || registration.status !== 'confirmed') return null;
  return (
    <section className="relink-accounts" aria-label={t('Live-Link')}>
      <h3>{t('Live-Link')}</h3>
      <p className="hint">{t('Schickt den Spielern einen neuen persönlichen Live-Link. Der bisherige Link wird damit ungültig.')}</p>
      <div className="row-actions">
        <Button variant="secondary" loading={busyId === 'live-link'} disabled={Boolean(busyId)} onClick={() => onResend(registration)}>
          {t('Live-Link neu senden')}
        </Button>
      </div>
    </section>
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
  organizerMessageFilter = '',
  onOrganizerMessageFilterChange,
  questionFilter = '',
  onQuestionFilterChange,
  feeFilter = '',
  onFeeFilterChange,
  onResetFilters,
  onEdit,
  onConfirm,
  onConfirmAll,
  onDelete,
  busyId,
  message,
  error,
  currentUserId,
}) {
  const { t } = useTranslation();
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvNamesOnly, setCsvNamesOnly] = useState(false);
  const [csvConfirmedOnly, setCsvConfirmedOnly] = useState(false);
  const filtered = Boolean(query.trim()) || Boolean(statusFilter) || Boolean(organizerMessageFilter) || Boolean(questionFilter) || Boolean(feeFilter);
  const pendingRegistrations = filteredRegistrations.filter((registration) => registration.status === 'pending');
  const otherRegistrations = filteredRegistrations.filter((registration) => registration.status !== 'pending');
  const visiblePendingRegistrations = useInfiniteList(pendingRegistrations);
  const visibleOtherRegistrations = useInfiniteList(otherRegistrations);
  const questionOptions = (tournament?.registrationQuestions || []).map((question) => ({ value: question.id, label: question.label }));
  const feeOptions = [...new Map(registrations.flatMap((registration) => (registration.feeSelections || []).map((selection) => [selection.tariffId, selection.name]))).entries()]
    .filter(([id, name]) => id && name)
    .map(([value, label]) => ({ value, label }));

  function rowProps(registration) {
    const busy = busyId === `confirm-${registration.id}` ? `confirm-${registration.id}` : busyId === `delete-${registration.id}` ? `delete-${registration.id}` : '';
    return { busy, busyOther: Boolean(busyId) && !busy };
  }

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Anmeldungen')}</h2>
        <span className="counter">{filtered ? `${filteredRegistrations.length}/${registrations.length}` : registrations.length}</span>
        <Button variant="secondary" disabled={registrations.length === 0} onClick={() => setCsvDialogOpen(true)}>{t('CSV exportieren')}</Button>
        <Button onClick={onCreate} disabled={!tournament}>{t('Neue Anmeldung')}</Button>
      </div>
      <EditDialog open={csvDialogOpen} title={t('CSV exportieren')} onClose={() => setCsvDialogOpen(false)}>
        <div className="form dense">
          <label className="checkbox-field">
            <input type="checkbox" checked={csvNamesOnly} onChange={(event) => setCsvNamesOnly(event.target.checked)} />
            {t('Nur Namen')}
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={csvConfirmedOnly} onChange={(event) => setCsvConfirmedOnly(event.target.checked)} />
            {t('Nur bestätigte Meldungen')}
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setCsvDialogOpen(false)}>{t('Abbrechen')}</Button>
            <Button onClick={() => { downloadRegistrationsCsv(tournament, registrations, t, { namesOnly: csvNamesOnly, confirmedOnly: csvConfirmedOnly }); setCsvDialogOpen(false); }}>{t('CSV herunterladen')}</Button>
          </div>
        </div>
      </EditDialog>
      <Feedback message={message} />
      <Feedback error={error} />
      <TournamentPicker
        label={t('Turnier anzeigen')}
        tournaments={tournaments}
        value={tournament?.id || ''}
        onChange={onTournamentChange}
        currentUserId={currentUserId}
      />
      {!tournament?.canManage && <p className="muted">{t('Für dieses Turnier sind Anmeldungen nur für Admins und zuständige Turnierleiter sichtbar.')}</p>}
      <ListToolbar
        query={query}
        onQueryChange={onQueryChange}
        searchPlaceholder={t('Name oder Team suchen')}
        filters={[
          { label: t('Status filtern'), value: statusFilter, onChange: onStatusFilterChange, options: [{ value: '', label: t('Alle Status') }, ...translatedOptions(REGISTRATION_STATUSES)] },
          { label: t('Nachricht an Turnierleitung'), value: organizerMessageFilter, onChange: onOrganizerMessageFilterChange, options: [{ value: '', label: t('Alle Nachrichten') }, { value: 'with_message', label: t('Mit Nachricht') }, { value: 'without_message', label: t('Ohne Nachricht') }] },
          { label: t('Frage beantwortet'), value: questionFilter, onChange: onQuestionFilterChange, options: [{ value: '', label: t('Alle Fragen') }, ...questionOptions] },
          { label: t('Tarif ausgewählt'), value: feeFilter, onChange: onFeeFilterChange, options: [{ value: '', label: t('Alle Tarife') }, ...feeOptions] },
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
  currentUserId,
  clubNames,
}) {
  const { t } = useTranslation();
  const [registrations, setRegistrations] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [organizerMessageFilter, setOrganizerMessageFilter] = useState('');
  const [questionFilter, setQuestionFilter] = useState('');
  const [feeFilter, setFeeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_REGISTRATION_FORM);
  const [invalidField, setInvalidField] = useState(null);
  const [mode, setMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');

  const manageableTournaments = useMemo(
    () => tournaments.filter((item) => item.canManage && !isCalendarEntry(item)),
    [tournaments],
  );
  const tournament = manageableTournaments.find((item) => item.id === selectedTournamentId) || null;
  const manageMode = Boolean(tournament?.canManage);

  useEffect(() => {
    if (manageableTournaments.length > 0 && !tournament) {
      setSelectedTournamentId(manageableTournaments[0].id);
    } else if (manageableTournaments.length === 0 && selectedTournamentId) {
      setSelectedTournamentId('');
    }
  }, [manageableTournaments, selectedTournamentId, setSelectedTournamentId, tournament]);

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
    () => filterRegistrations(registrations, query, statusFilter, { organizerMessageFilter, questionFilter, feeFilter }),
    [registrations, query, statusFilter, organizerMessageFilter, questionFilter, feeFilter],
  );

  function handleTournamentChange(tournamentId) {
    setSelectedTournamentId(tournamentId);
    setQuery('');
    setStatusFilter('');
    setOrganizerMessageFilter('');
    setQuestionFilter('');
    setFeeFilter('');
  }

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
    if (!tournament) return;
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

  // "Konto neu zuordnen" (KP-11): einziger Weg, das Konto eines bereits verknüpften Slots zu wechseln.
  async function handleRelink(registration, slot) {
    setError(''); setMessage('');
    setBusyId(`relink-${slot}`);
    try {
      const result = await authenticatedApi(`/api/registrations/${registration.id}/slots/${slot}/relink`, { method: 'POST' });
      setMessage(result.linked ? t('Das Konto wurde neu zugeordnet.') : t('Zur gespeicherten E-Mail gibt es kein eindeutiges bestätigtes Konto; die Verknüpfung wurde gelöst.'));
      await load(registration.tournamentId);
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function handleLiveLinkResend(registration) {
    setError(''); setMessage('');
    setBusyId('live-link');
    try {
      await authenticatedApi(`/api/registrations/${registration.id}/live-link`, { method: 'POST' });
      setMessage(t('Ein neuer Live-Link wurde an die Spieler geschickt.'));
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
        onTournamentChange={handleTournamentChange}
        onCreate={openCreate}
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        organizerMessageFilter={organizerMessageFilter}
        onOrganizerMessageFilterChange={setOrganizerMessageFilter}
        questionFilter={questionFilter}
        onQuestionFilterChange={setQuestionFilter}
        feeFilter={feeFilter}
        onFeeFilterChange={setFeeFilter}
        onResetFilters={() => { setQuery(''); setStatusFilter(''); setOrganizerMessageFilter(''); setQuestionFilter(''); setFeeFilter(''); }}
        onEdit={openEdit}
        onConfirm={handleConfirm}
        onConfirmAll={handleConfirmAll}
        onDelete={handleDelete}
        busyId={busyId}
        message={message}
        error={error}
        currentUserId={currentUserId}
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
          currentUserId={currentUserId}
          clubNames={clubNames}
        />
        {mode === 'edit' && (
          <RelinkAccounts
            registration={registrations.find((entry) => entry.id === form.id)}
            busyId={busyId}
            onRelink={handleRelink}
          />
        )}
        {mode === 'edit' && (
          <LiveLinkResend
            registration={registrations.find((entry) => entry.id === form.id)}
            tournament={tournament}
            busyId={busyId}
            onResend={handleLiveLinkResend}
          />
        )}
      </EditDialog>
    </>
  );
}

export default RegistrationsManagementPage;
