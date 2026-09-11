import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, TOURNAMENT_STATUSES, VISIBILITIES } from '../lib/constants.js';
import { MAIL_NOT_ENABLED_HINT_TEMPLATES, currencyOptions, formatDate } from '../lib/format.js';
import { labelFor, formationLabel, formatTournamentStartTime } from '../lib/domain.js';
import { TextField, TextArea, SelectField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';

function FormationHelpDialog({ onClose }) {
  const { t } = useTranslation();
  return (
    <EditDialog wide nested title={t('Formation, Anmeldetyp & Turniersystem')} onClose={onClose}>
      <p>
          {t('Die Formation bestimmt die Teamgröße (wie viele Spieler gemeinsam antreten). Der Anmeldetyp bestimmt die Teambildung (wann und wie die Teams gebildet werden). Das Turniersystem bestimmt anschließend, wie diese Teams gegeneinander spielen.')}
        </p>
        <ul>
          <li>
            <strong>{t('Tête (1 Spieler):')}</strong> {t('Keine Teambildung nötig – jeder Spieler ist sein eigenes Team. Anmeldetyp ist deshalb fest auf Formée gesetzt; jedes Turniersystem ist möglich.')}
          </li>
          <li>
            <strong>{t('Doublette / Triplette (2 bzw. 3 Spieler):')}</strong>
            <ul>
              <li><strong>{t('Formée')}</strong> – {t('Teams werden von den Teilnehmern vorgegeben und bleiben fest.')}</li>
              <li><strong>{t('Mêlée')}</strong> – {t('Spieler melden sich einzeln an, Teams werden einmal vor Turnierbeginn ausgelost und bleiben dann fest.')}</li>
              <li><strong>{t('Supermêlée')}</strong> – {t('Spieler melden sich einzeln an, Teams werden vor jeder Runde neu ausgelost.')}</li>
            </ul>
          </li>
          <li>
            {t('Feste Teams (Tête, Formée, Mêlée nach der Auslosung) sind mit jedem normalen Turniersystem kombinierbar. Supermêlée setzt voraus, dass Teams nicht dauerhaft fest sind, und ist deshalb auf das Turniersystem Rangliste festgelegt.')}
          </li>
        </ul>
        <div className="table-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>{t('Formation')}</th>
                <th>{t('Anmeldetyp')}</th>
                <th>{t('Teambildung')}</th>
                <th>{t('Turniersystem')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('Tête')}</td>
                <td>{t('Formée')}</td>
                <td>{t('keine (jeder Spieler ist sein eigenes Team)')}</td>
                <td>{t('alle geeigneten Turniersysteme')}</td>
              </tr>
              <tr>
                <td>{t('Tête')}</td>
                <td>{t('Mêlée / Supermêlée')}</td>
                <td className="no">{t('nicht möglich')}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>{t('Doublette / Triplette')}</td>
                <td>{t('Formée')}</td>
                <td>{t('von Teilnehmern vorgegeben, fest')}</td>
                <td>{t('alle geeigneten Turniersysteme')}</td>
              </tr>
              <tr>
                <td>{t('Doublette / Triplette')}</td>
                <td>{t('Mêlée')}</td>
                <td>{t('einmal vor Turnierbeginn ausgelost, dann fest')}</td>
                <td>{t('alle geeigneten Turniersysteme')}</td>
              </tr>
              <tr>
                <td>{t('Doublette / Triplette')}</td>
                <td>{t('Supermêlée')}</td>
                <td>{t('vor jeder Runde neu ausgelost')}</td>
                <td>{t('nur Rangliste')}</td>
              </tr>
            </tbody>
          </table>
        </div>
    </EditDialog>
  );
}

export function TournamentForm({ form, setForm, onSubmit, onCancel, mode, isAdmin, users, language, currentUser }) {
  const { t } = useTranslation();
  const [showFormationHelp, setShowFormationHelp] = useState(false);
  const managerOptions = [
    { value: '', label: t('(ich selbst)') },
    ...users.map((user) => ({ value: user.id, label: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email })),
  ];
  const showMailNotEnabledHint = !isAdmin && currentUser && currentUser.mailEnabled === false;
  // Kalendereintrag = per "Turnier melden" eingereicht (registrationEnabled=false), nur die
  // damals abgefragten Felder sind hier sinnvoll editierbar - alles rund um Anmeldung,
  // Turniersystem, Gebühren etc. ist für so einen Eintrag ohne Bedeutung.
  const isCalendarEntry = mode === 'edit' && form.registrationEnabled === false;

  return (
    <form className="form dense" onSubmit={onSubmit}>
      {showMailNotEnabledHint && (
        <p className="feedback offline">{MAIL_NOT_ENABLED_HINT_TEMPLATES[language] || MAIL_NOT_ENABLED_HINT_TEMPLATES.de}</p>
      )}
      {isCalendarEntry && (
        <TextField label={t('Verein')} value={form.club} onChange={(club) => setForm({ ...form, club })} required minLength={2} />
      )}
      <TextField label={t('Name')} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      {isAdmin && !isCalendarEntry && (
        <SelectField
          label={t('Turnierleiter')}
          value={form.managerId}
          onChange={(managerId) => setForm({ ...form, managerId })}
          options={managerOptions}
        />
      )}
      <div className="form-grid">
        <TextField label={t('Datum')} type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label={t('Startzeit')} type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      <LocationAutocomplete
        label={t('Ort')}
        value={form.location}
        onChange={(location) => setForm({ ...form, location, locationConfirmed: false })}
        onSelect={(candidate) => setForm({
          ...form,
          location: candidate.displayName,
          latitude: candidate.lat,
          longitude: candidate.lng,
          locationConfirmed: true,
        })}
        confirmed={form.locationConfirmed}
        required
        minLength={2}
        language={language}
      />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.overrideCoordinates}
          onChange={(event) => setForm({ ...form, overrideCoordinates: event.target.checked })}
        />
        {t('Koordinaten manuell anpassen')}
      </label>
      {form.overrideCoordinates && (
        <div className="form-grid">
          <TextField
            label={t('Breitengrad')}
            type="number"
            inputMode="decimal"
            value={form.latitude}
            onChange={(latitude) => setForm({ ...form, latitude })}
          />
          <TextField
            label={t('Längengrad')}
            type="number"
            inputMode="decimal"
            value={form.longitude}
            onChange={(longitude) => setForm({ ...form, longitude })}
          />
        </div>
      )}
      {isCalendarEntry ? (
        <SelectField
          label={t('Formation')}
          value={form.formation}
          onChange={(formation) => setForm({ ...form, formation })}
          options={FORMATIONS}
        />
      ) : (
        <>
          <div className="form-section-header">
            <span>{t('Formation, Anmeldetyp & Turniersystem')}</span>
            <button type="button" className="help-btn" onClick={() => setShowFormationHelp(true)} aria-label={t('Hilfe zu Formation, Anmeldetyp und Turniersystem')}>
              {t('? Hilfe')}
            </button>
          </div>
          <div className="form-grid-3">
            <SelectField
              label={t('Formation')}
              value={form.formation}
              onChange={(formation) => setForm({
                ...form,
                formation,
                registrationType: (formation === 'tete' || formation === 'andere') ? 'forme' : form.registrationType,
              })}
              options={form.registrationType === 'supermelee' ? FORMATIONS.filter((option) => option.value !== 'tete' && option.value !== 'andere') : FORMATIONS}
            />
            <SelectField
              label={t('Anmeldetyp')}
              value={form.registrationType}
              onChange={(registrationType) => setForm({
                ...form,
                registrationType,
                type: registrationType === 'supermelee' ? 'rangliste' : form.type,
                formation: registrationType === 'supermelee' && (form.formation === 'tete' || form.formation === 'andere') ? 'doublette' : form.formation,
              })}
              options={(form.formation === 'tete' || form.formation === 'andere') ? REGISTRATION_TYPES.filter((option) => option.value === 'forme') : REGISTRATION_TYPES}
              disabled={form.formation === 'tete' || form.formation === 'andere'}
            />
            <SelectField
              label={t('Turniersystem')}
              value={form.registrationType === 'supermelee' ? 'rangliste' : form.type}
              onChange={(type) => setForm({ ...form, type })}
              options={TOURNAMENT_TYPES}
              disabled={form.registrationType === 'supermelee'}
            />
          </div>
          {showFormationHelp && (
            <FormationHelpDialog onClose={() => setShowFormationHelp(false)} />
          )}
        </>
      )}
      <div className="form-grid">
        <SelectField label={t('Status')} value={form.status} onChange={(status) => setForm({ ...form, status })} options={TOURNAMENT_STATUSES} />
        {!isCalendarEntry && (
          <SelectField label={t('Sichtbarkeit')} value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} options={VISIBILITIES} />
        )}
      </div>
      {!isCalendarEntry && (
        <>
          <div className="form-grid">
            <TextField label={t('Max. Meldungen')} type="number" min="0" value={form.maxRegistrations} onChange={(maxRegistrations) => setForm({ ...form, maxRegistrations })} />
          </div>
          <div className="form-grid">
            <TextField label={t('Startgeld')} inputMode="decimal" value={form.entryFeeAmount} onChange={(entryFeeAmount) => setForm({ ...form, entryFeeAmount })} />
            <SelectField label={t('Währung')} value={form.currency} onChange={(currency) => setForm({ ...form, currency })} options={currencyOptions(language)} />
          </div>
          <div className="form-grid">
            <TextField label={t('Anmeldung möglich ab')} type="datetime-local" value={form.registrationOpensAt} onChange={(registrationOpensAt) => setForm({ ...form, registrationOpensAt })} />
            <TextField label={t('Meldefrist')} type="datetime-local" value={form.registrationDeadline} onChange={(registrationDeadline) => setForm({ ...form, registrationDeadline })} />
          </div>
          <p className="hint">{t('Die Uhrzeiten gelten als Ortszeit am Turnierstandort und werden automatisch der passenden Zeitzone zugeordnet.')}</p>
        </>
      )}
      {mode === 'edit' && form.timezone && <p className="hint">{t('Erkannte Zeitzone:')} {form.timezone}</p>}
      <div className="form-grid">
        <TextField label={t('Kontaktname')} value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
        <TextField label={t('Kontakt-E-Mail')} type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} />
      </div>
      {!isCalendarEntry && (
        <TextField label={t('Kontakt-Telefon')} value={form.contactPhone} onChange={(contactPhone) => setForm({ ...form, contactPhone })} />
      )}
      <TextArea label={t('Beschreibung')} value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextArea label={t('Interne Notizen')} value={form.internalNotes} onChange={(internalNotes) => setForm({ ...form, internalNotes })} />
      {!isCalendarEntry && (
        <>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.licenseRequired}
              onChange={(event) => setForm({ ...form, licenseRequired: event.target.checked })}
            />
            {t('Lizenznummer erforderlich')}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.teamNameEnabled}
              onChange={(event) => setForm({ ...form, teamNameEnabled: event.target.checked })}
            />
            {t('Teamname abfragen')}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.waitlistEnabled}
              onChange={(event) => setForm({ ...form, waitlistEnabled: event.target.checked })}
            />
            {t('Warteliste ermöglichen')}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.approvalRequired}
              onChange={(event) => setForm({ ...form, approvalRequired: event.target.checked })}
            />
            {t('Anmeldungen vor der Bestätigung durch den Turnierleiter prüfen')}
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.participantsPublic}
              onChange={(event) => setForm({ ...form, participantsPublic: event.target.checked })}
            />
            {t('Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.')}
          </label>
        </>
      )}
      <TextField label={t('Website')} type="url" placeholder="https://…" value={form.websiteUrl} onChange={(websiteUrl) => setForm({ ...form, websiteUrl })} />
      {!isCalendarEntry && (
        <>
          <TextField label={t('Logo-Bildlink')} type="url" placeholder="https://…" value={form.logoUrl} onChange={(logoUrl) => setForm({ ...form, logoUrl })} />
          <TextField label={t('Flyer-Bildlink')} type="url" placeholder="https://…" value={form.flyerUrl} onChange={(flyerUrl) => setForm({ ...form, flyerUrl })} />
        </>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" type="button" onClick={onCancel}>{t('Abbrechen')}</Button>
        <Button type="submit">{mode === 'edit' ? t('Turnier speichern') : t('Turnier anlegen')}</Button>
      </div>
    </form>
  );
}

export function TournamentList({
  tournaments,
  totalTournaments,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  isAdmin,
  language,
  onCreate,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  onResetFilters,
}) {
  const { t } = useTranslation();
  const filtered = tournaments.length !== totalTournaments;

  return (
    <div className="panel">
      <div className="section-title">
        <h2>{t('Turniere')}</h2>
        <span className="counter">{filtered ? `${tournaments.length}/${totalTournaments}` : totalTournaments}</span>
        <Button onClick={onCreate}>{t('Neues Turnier')}</Button>
      </div>
      <ListToolbar
        query={query}
        onQueryChange={onQueryChange}
        searchPlaceholder={t('Name oder Ort suchen')}
        filters={[
          { label: t('Status filtern'), value: statusFilter, onChange: onStatusFilterChange, options: [{ value: '', label: t('Alle Status') }, ...TOURNAMENT_STATUSES] },
        ]}
        onReset={onResetFilters}
        resetDisabled={!filtered}
      />
      <div className="user-list">
        {tournaments.map((tournament) => (
          <article className={`data-row tournament-row ${selectedId === tournament.id ? 'selected' : ''}`} key={tournament.id}>
            <button className="row-main" type="button" onClick={() => onSelect(tournament.id)}>
              <strong data-i18n-skip>{tournament.name}</strong>
              {tournament.registrationEnabled === false && <span className="role">{t('Kalendereintrag')}</span>}
              <span>{formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)} · <span data-i18n-skip>{tournament.location}</span></span>
              {tournament.registrationEnabled !== false && (
                <small>{formationLabel(tournament)} · {labelFor(REGISTRATION_TYPES, tournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, tournament.type)}</small>
              )}
              {isAdmin && tournament.managerName && <small>{t('Turnierleiter:')} <span data-i18n-skip>{tournament.managerName}</span></small>}
            </button>
            <div className="badges">
              {tournament.registrationEnabled === false ? (
                <span className={`status status-${tournament.status}`}>
                  {t(tournament.status === 'draft' ? 'Unsichtbar' : 'Sichtbar')}
                </span>
              ) : (
                <>
                  <span className={`status status-${tournament.status}`}>{labelFor(TOURNAMENT_STATUSES, tournament.status)}</span>
                  <span className="role">{tournament.activeRegistrations}/{tournament.maxRegistrations || '∞'}</span>
                  {tournament.waitlistRegistrations > 0 && <span className="role role-user">{tournament.waitlistRegistrations} {t('Warteliste')}</span>}
                </>
              )}
            </div>
            {tournament.canManage && (
              <div className="row-actions">
                {tournament.documentManaged ? (
                  <span className="muted">{t('Eckdaten im Turnierdokument')}</span>
                ) : (
                  <Button variant="secondary" onClick={() => onEdit(tournament)}>{t('Bearbeiten')}</Button>
                )}
                <Button variant="danger" onClick={() => onDelete(tournament)}>{t('Löschen')}</Button>
              </div>
            )}
          </article>
        ))}
        {tournaments.length === 0 && <p className="muted">{t('Keine Turniere gefunden.')}</p>}
      </div>
    </div>
  );
}

export function TournamentManagementPage({
  tournaments,
  totalTournaments,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  isAdmin,
  language,
  onCreate,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  onResetFilters,
  canManageTournaments,
  tournamentDialogOpen,
  tournamentMode,
  tournamentForm,
  setTournamentForm,
  onTournamentSubmit,
  onCloseTournamentDialog,
  users,
  currentUser,
}) {
  const { t } = useTranslation();
  return (
    <>
      <TournamentList
        tournaments={tournaments}
        totalTournaments={totalTournaments}
        selectedId={selectedId}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
        isAdmin={isAdmin}
        language={language}
        onCreate={onCreate}
        query={query}
        onQueryChange={onQueryChange}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        onResetFilters={onResetFilters}
      />

      {canManageTournaments && (
        <EditDialog
          open={tournamentDialogOpen}
          wide
          title={tournamentMode === 'edit' ? t('Turnier bearbeiten') : t('Turnier anlegen')}
          onClose={onCloseTournamentDialog}
        >
          <TournamentForm
            form={tournamentForm}
            setForm={setTournamentForm}
            onSubmit={onTournamentSubmit}
            onCancel={onCloseTournamentDialog}
            mode={tournamentMode}
            isAdmin={isAdmin}
            users={users}
            language={language}
            currentUser={currentUser}
          />
        </EditDialog>
      )}
    </>
  );
}

export default TournamentManagementPage;
