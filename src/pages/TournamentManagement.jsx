import { useState } from 'react';
import { FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, TOURNAMENT_STATUSES, VISIBILITIES } from '../lib/constants.js';
import { MAIL_NOT_ENABLED_HINT_TEMPLATES, currencyOptions, formatDate } from '../lib/format.js';
import { translateText } from '../lib/i18n.js';
import { labelFor, formationLabel, formatTournamentStartTime } from '../lib/domain.js';
import { TextField, TextArea, SelectField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';

function FormationHelpDialog({ onClose }) {
  return (
    <EditDialog wide nested title="Formation, Anmeldetyp & Turniersystem" onClose={onClose}>
      <p>
          Die <strong>Formation</strong> bestimmt die Teamgröße (wie viele Spieler gemeinsam antreten). Der{' '}
          <strong>Anmeldetyp</strong> bestimmt die Teambildung (wann und wie die Teams gebildet werden). Das{' '}
          <strong>Turniersystem</strong> bestimmt anschließend, wie diese Teams gegeneinander spielen.
        </p>
        <ul>
          <li>
            <strong>Tête (1 Spieler):</strong> Keine Teambildung nötig – jeder Spieler ist sein eigenes Team. Anmeldetyp
            ist deshalb fest auf <strong>Formée</strong> gesetzt; jedes Turniersystem ist möglich.
          </li>
          <li>
            <strong>Doublette / Triplette (2 bzw. 3 Spieler):</strong>
            <ul>
              <li><strong>Formée</strong> – Teams werden von den Teilnehmern vorgegeben und bleiben fest.</li>
              <li><strong>Mêlée</strong> – Spieler melden sich einzeln an, Teams werden einmal vor Turnierbeginn ausgelost und bleiben dann fest.</li>
              <li><strong>Supermêlée</strong> – Spieler melden sich einzeln an, Teams werden vor jeder Runde neu ausgelost.</li>
            </ul>
          </li>
          <li>
            Feste Teams (Tête, Formée, Mêlée nach der Auslosung) sind mit jedem normalen Turniersystem kombinierbar.
            <strong> Supermêlée</strong> setzt voraus, dass Teams nicht dauerhaft fest sind, und ist deshalb auf das
            Turniersystem <strong>Rangliste</strong> festgelegt.
          </li>
        </ul>
        <div className="table-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Formation</th>
                <th>Anmeldetyp</th>
                <th>Teambildung</th>
                <th>Turniersystem</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Tête</td>
                <td>Formée</td>
                <td>keine (jeder Spieler ist sein eigenes Team)</td>
                <td>alle geeigneten Turniersysteme</td>
              </tr>
              <tr>
                <td>Tête</td>
                <td>Mêlée / Supermêlée</td>
                <td className="no">nicht möglich</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Doublette / Triplette</td>
                <td>Formée</td>
                <td>von Teilnehmern vorgegeben, fest</td>
                <td>alle geeigneten Turniersysteme</td>
              </tr>
              <tr>
                <td>Doublette / Triplette</td>
                <td>Mêlée</td>
                <td>einmal vor Turnierbeginn ausgelost, dann fest</td>
                <td>alle geeigneten Turniersysteme</td>
              </tr>
              <tr>
                <td>Doublette / Triplette</td>
                <td>Supermêlée</td>
                <td>vor jeder Runde neu ausgelost</td>
                <td>nur Rangliste</td>
              </tr>
            </tbody>
          </table>
        </div>
    </EditDialog>
  );
}

export function TournamentForm({ form, setForm, onSubmit, onCancel, mode, isAdmin, users, language, currentUser }) {
  const [showFormationHelp, setShowFormationHelp] = useState(false);
  const managerOptions = [
    { value: '', label: '(ich selbst)' },
    ...users.map((user) => ({ value: user.id, label: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email })),
  ];
  const showMailNotEnabledHint = !isAdmin && currentUser && currentUser.mailEnabled === false;

  return (
    <form className="form dense" onSubmit={onSubmit}>
      {showMailNotEnabledHint && (
        <p className="feedback offline">{MAIL_NOT_ENABLED_HINT_TEMPLATES[language] || MAIL_NOT_ENABLED_HINT_TEMPLATES.de}</p>
      )}
      <TextField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      {isAdmin && (
        <SelectField
          label="Turnierleiter"
          value={form.managerId}
          onChange={(managerId) => setForm({ ...form, managerId })}
          options={managerOptions}
        />
      )}
      <div className="form-grid">
        <TextField label="Datum" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label="Startzeit" type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      <TextField label="Ort" value={form.location} onChange={(location) => setForm({ ...form, location })} required minLength={2} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.overrideCoordinates}
          onChange={(event) => setForm({ ...form, overrideCoordinates: event.target.checked })}
        />
        Koordinaten manuell anpassen
      </label>
      {form.overrideCoordinates && (
        <div className="form-grid">
          <TextField
            label="Breitengrad"
            type="number"
            inputMode="decimal"
            value={form.latitude}
            onChange={(latitude) => setForm({ ...form, latitude })}
          />
          <TextField
            label="Längengrad"
            type="number"
            inputMode="decimal"
            value={form.longitude}
            onChange={(longitude) => setForm({ ...form, longitude })}
          />
        </div>
      )}
      <div className="form-section-header">
        <span>Formation, Anmeldetyp &amp; Turniersystem</span>
        <button type="button" className="help-btn" onClick={() => setShowFormationHelp(true)} aria-label="Hilfe zu Formation, Anmeldetyp und Turniersystem">
          ? Hilfe
        </button>
      </div>
      <div className="form-grid-3">
        <SelectField
          label="Formation"
          value={form.formation}
          onChange={(formation) => setForm({
            ...form,
            formation,
            registrationType: (formation === 'tete' || formation === 'andere') ? 'forme' : form.registrationType,
          })}
          options={form.registrationType === 'supermelee' ? FORMATIONS.filter((option) => option.value !== 'tete' && option.value !== 'andere') : FORMATIONS}
        />
        <SelectField
          label="Anmeldetyp"
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
          label="Turniersystem"
          value={form.registrationType === 'supermelee' ? 'rangliste' : form.type}
          onChange={(type) => setForm({ ...form, type })}
          options={TOURNAMENT_TYPES}
          disabled={form.registrationType === 'supermelee'}
        />
      </div>
      {showFormationHelp && (
        <FormationHelpDialog onClose={() => setShowFormationHelp(false)} />
      )}
      <div className="form-grid">
        <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={TOURNAMENT_STATUSES} />
        <SelectField label="Sichtbarkeit" value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} options={VISIBILITIES} />
      </div>
      <div className="form-grid">
        <TextField label="Max. Meldungen" type="number" min="0" value={form.maxRegistrations} onChange={(maxRegistrations) => setForm({ ...form, maxRegistrations })} />
      </div>
      <div className="form-grid">
        <TextField label={translateText('Startgeld', language)} inputMode="decimal" value={form.entryFeeAmount} onChange={(entryFeeAmount) => setForm({ ...form, entryFeeAmount })} />
        <SelectField label={translateText('Währung', language)} value={form.currency} onChange={(currency) => setForm({ ...form, currency })} options={currencyOptions(language)} />
      </div>
      <div className="form-grid">
        <TextField label={translateText('Anmeldung möglich ab', language)} type="datetime-local" value={form.registrationOpensAt} onChange={(registrationOpensAt) => setForm({ ...form, registrationOpensAt })} />
        <TextField label={translateText('Meldefrist', language)} type="datetime-local" value={form.registrationDeadline} onChange={(registrationDeadline) => setForm({ ...form, registrationDeadline })} />
      </div>
      <p className="hint">{translateText('Die Uhrzeiten gelten als Ortszeit am Turnierstandort und werden automatisch der passenden Zeitzone zugeordnet.', language)}</p>
      {mode === 'edit' && form.timezone && <p className="hint">{translateText('Erkannte Zeitzone:', language)} {form.timezone}</p>}
      <div className="form-grid">
        <TextField label="Kontaktname" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
        <TextField label="Kontakt-E-Mail" type="email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} />
      </div>
      <TextField label="Kontakt-Telefon" value={form.contactPhone} onChange={(contactPhone) => setForm({ ...form, contactPhone })} />
      <TextArea label="Beschreibung" value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextArea label="Interne Notizen" value={form.internalNotes} onChange={(internalNotes) => setForm({ ...form, internalNotes })} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.licenseRequired}
          onChange={(event) => setForm({ ...form, licenseRequired: event.target.checked })}
        />
        Lizenznummer erforderlich
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.teamNameEnabled}
          onChange={(event) => setForm({ ...form, teamNameEnabled: event.target.checked })}
        />
        Teamname abfragen
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.waitlistEnabled}
          onChange={(event) => setForm({ ...form, waitlistEnabled: event.target.checked })}
        />
        Warteliste ermöglichen
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={form.participantsPublic}
          onChange={(event) => setForm({ ...form, participantsPublic: event.target.checked })}
        />
        Teilnehmerliste öffentlich sichtbar. Ich bestätige, dass ich als Turnierersteller für diese Veröffentlichung verantwortlich bin und die Teilnehmer ausdrücklich darauf hinweisen muss.
      </label>
      <TextField label="Website" type="url" placeholder="https://…" value={form.websiteUrl} onChange={(websiteUrl) => setForm({ ...form, websiteUrl })} />
      <TextField label="Logo-Bildlink" type="url" placeholder="https://…" value={form.logoUrl} onChange={(logoUrl) => setForm({ ...form, logoUrl })} />
      <TextField label="Flyer-Bildlink" type="url" placeholder="https://…" value={form.flyerUrl} onChange={(flyerUrl) => setForm({ ...form, flyerUrl })} />
      <div className="dialog-actions">
        <Button variant="secondary" type="button" onClick={onCancel}>Abbrechen</Button>
        <Button type="submit">{mode === 'edit' ? 'Turnier speichern' : 'Turnier anlegen'}</Button>
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
  const filtered = tournaments.length !== totalTournaments;

  return (
    <div className="panel">
      <div className="section-title">
        <h2>Turniere</h2>
        <span className="counter">{filtered ? `${tournaments.length}/${totalTournaments}` : totalTournaments}</span>
        <Button onClick={onCreate}>Neues Turnier</Button>
      </div>
      <ListToolbar
        query={query}
        onQueryChange={onQueryChange}
        searchPlaceholder="Name oder Ort suchen"
        filters={[
          { label: 'Status filtern', value: statusFilter, onChange: onStatusFilterChange, options: [{ value: '', label: 'Alle Status' }, ...TOURNAMENT_STATUSES] },
        ]}
        onReset={onResetFilters}
        resetDisabled={!filtered}
      />
      <div className="user-list">
        {tournaments.map((tournament) => (
          <article className={`data-row tournament-row ${selectedId === tournament.id ? 'selected' : ''}`} key={tournament.id}>
            <button className="row-main" type="button" onClick={() => onSelect(tournament.id)}>
              <strong>{tournament.name}</strong>
              {tournament.registrationEnabled === false && <span className="role">{translateText('Kalendereintrag', language)}</span>}
              <span>{formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)} · {tournament.location}</span>
              {tournament.registrationEnabled !== false && (
                <small>{formationLabel(tournament)} · {labelFor(REGISTRATION_TYPES, tournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, tournament.type)}</small>
              )}
              {isAdmin && tournament.managerName && <small>Turnierleiter: {tournament.managerName}</small>}
            </button>
            <div className="badges">
              {tournament.registrationEnabled === false ? (
                <span className={`status status-${tournament.status}`}>
                  {translateText(tournament.status === 'draft' ? 'Unsichtbar' : 'Sichtbar', language)}
                </span>
              ) : (
                <>
                  <span className={`status status-${tournament.status}`}>{labelFor(TOURNAMENT_STATUSES, tournament.status)}</span>
                  <span className="role">{tournament.activeRegistrations}/{tournament.maxRegistrations || '∞'}</span>
                  {tournament.waitlistRegistrations > 0 && <span className="role role-user">{tournament.waitlistRegistrations} Warteliste</span>}
                </>
              )}
            </div>
            {tournament.canManage && (
              <div className="row-actions">
                {tournament.documentManaged ? (
                  <span className="muted">Eckdaten im Turnierdokument</span>
                ) : (
                  <Button variant="secondary" onClick={() => onEdit(tournament)}>Bearbeiten</Button>
                )}
                <Button variant="danger" onClick={() => onDelete(tournament)}>Löschen</Button>
              </div>
            )}
          </article>
        ))}
        {tournaments.length === 0 && <p className="muted">Keine Turniere gefunden.</p>}
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
          title={tournamentMode === 'edit' ? 'Turnier bearbeiten' : 'Turnier anlegen'}
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
