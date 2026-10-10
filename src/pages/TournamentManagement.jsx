import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EMPTY_TOURNAMENT_FORM, FORMATIONS, REGISTRATION_TYPES, TOURNAMENT_TYPES, TOURNAMENT_STATUSES, VISIBILITIES } from '../lib/constants.js';
import { MAIL_NOT_ENABLED_HINT_TEMPLATES, currencyOptions, formatDate, minorUnitsToAmount, utcIsoToZonedDateTimeInput } from '../lib/format.js';
import { isCalendarEntry, labelFor, formationLabel, formatLocationAddress, formatTournamentStartTime, tournamentPayload, translatedOptions } from '../lib/domain.js';
import { filterTournaments } from '../frontend-core.js';
import { Feedback, TextField, TextArea, SelectField, Button, ListToolbar, EditDialog } from '../components/ui.jsx';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { LocationAutocomplete } from '../components/LocationAutocomplete.jsx';
import { authenticatedApi } from '../lib/api.js';
import { formatUserLabel, formatUserName } from '../lib/userLabel.js';
import { UsernameReportButton } from '../components/UsernameReportDialog.jsx';
import { useClubSuggestions } from '../components/ClubSuggestions.jsx';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';
import { TournamentQrDialog } from '../components/TournamentQrDialog.jsx';
import { TournamentFlyerDialog } from '../components/TournamentFlyerDialog.jsx';

/**
 * Lösch-Rückfrage; bei einem mit einem Turnierdokument verbundenen Turnier mit deutlicher Warnung, weil Spieler
 * Live-Ansicht und Ergebnisse verlieren und das Dokument die Verbindung.
 */
// KP-07: Der Dialog nennt verbundenes Dokument, Anzahl der Anmeldungen, Turnierstatus und das Ende der Live-Ansicht.
function deleteTournamentConfirmation(t, tournament, documentManaged) {
  const parts = [t('Turnier „{name}“ wirklich löschen? Alle Anmeldungen dieses Turniers werden mitgelöscht und das kann nicht rückgängig gemacht werden.').replace('{name}', tournament.name)];
  const registrations = Number(tournament.activeRegistrations || 0) + Number(tournament.waitlistRegistrations || 0);
  parts.push(t('Anmeldungen: {count}').replace('{count}', String(registrations)));
  if (tournament.status === 'running') parts.push(t('Achtung: Das Turnier läuft gerade.'));
  if (registrations > 0) parts.push(t('Angemeldete sehen in ihrer Live-Ansicht danach nur noch den Hinweis, dass das Turnier gelöscht wurde.'));
  if (documentManaged) parts.push(t('Achtung: Dieses Turnier wird gerade von einem Turnierdokument (LibreOffice) geführt. Beim Löschen verlieren die Spieler Live-Ansicht und Ergebnisse, und das Turnierdokument verliert die Verbindung.'));
  return parts.join('\n\n');
}

/** Der Server verlangt die Bestätigung, weil das Turnier inzwischen mit einem Turnierdokument verbunden ist. */
/** Ein Turnier ist ans Turnierdokument gebunden oder wurde bereits aus ihm gestartet. */
function isDocumentBound(tournament) {
  return Boolean(tournament.documentManaged || tournament.desktopExecution);
}

function isDocumentManagedConflict(error) {
  return error?.status === 409 && error?.payload?.details?.code === 'document_managed';
}

function deleteTournamentRequest(tournamentId, confirmDocumentManaged) {
  const query = confirmDocumentManaged ? '?confirmDocumentManaged=true' : '';
  return authenticatedApi(`/api/tournaments/${tournamentId}${query}`, { method: 'DELETE' });
}

function TournamentEditorsPanel({ tournamentId, candidates = [], ownerId, owner, currentUserId }) {
  const { t } = useTranslation();
  const [editors, setEditors] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setEditors(null);
    authenticatedApi(`/api/tournaments/${tournamentId}/editors`)
      .then((data) => { if (!cancelled) setEditors(data.editors); })
      .catch((err) => { if (!cancelled) setPanelError(err.message); });
    return () => { cancelled = true; };
  }, [tournamentId]);

  // Schutz für noch nicht migrierte/inkonsistente Bestände: Der Owner steht
  // ausschließlich in der eigenen Owner-Zeile, nie nochmals als Bearbeiter.
  const additionalEditors = (editors || []).filter((editor) => editor.id !== ownerId);
  const availableCandidates = candidates.filter((candidate) => candidate.id !== ownerId && !additionalEditors.some((editor) => editor.id === candidate.id));

  async function handleAdd(event) {
    event.preventDefault();
    if (!selectedCandidateId) return;
    setBusy(true);
    setPanelError('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournamentId}/editors`, { method: 'POST', body: JSON.stringify({ userId: selectedCandidateId }) });
      setEditors(data.editors);
      setSelectedCandidateId('');
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(editorId) {
    setBusy(true);
    setPanelError('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournamentId}/editors/${editorId}`, { method: 'DELETE' });
      setEditors(data.editors);
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <span>{t('Bearbeitungsrechte verwalten')}</span>
      </div>
      <Feedback error={panelError} />
      {editors === null ? (
        <p className="muted">{t('Lädt …')}</p>
      ) : (
        <>
          {owner && (
            <ul className="editor-list">
              <li>
                <span data-i18n-skip>
                  {formatUserName(owner)}
                  {owner.username && <span className="user-handle"> @{owner.username}</span>}
                </span>
                <span className="role">{t('Owner')}</span>
              </li>
            </ul>
          )}
          {additionalEditors.length === 0 && <p className="muted">{t('Noch keine weiteren Bearbeiter für dieses Turnier.')}</p>}
          {additionalEditors.length > 0 && (
            <ul className="editor-list">
              {additionalEditors.map((editor) => (
                  <li key={editor.id}>
                    <span data-i18n-skip>
                      {formatUserName(editor)}
                      {editor.username && <span className="user-handle"> @{editor.username}</span>}
                    </span>
                    <span className="editor-actions">
                      <UsernameReportButton user={editor} currentUserId={currentUserId} />
                      <Button variant="secondary" type="button" disabled={busy} loading={busy} onClick={() => handleRemove(editor.id)}>{t('Entfernen')}</Button>
                    </span>
                  </li>
              ))}
            </ul>
          )}
          {availableCandidates.length > 0 && (
            <div className="inline-form">
              <SelectField
                label={t('Benutzer hinzufügen')}
                value={selectedCandidateId}
                onChange={setSelectedCandidateId}
                options={[
                  { value: '', label: t('Bitte wählen') },
                  ...availableCandidates.map((candidate) => ({ value: candidate.id, label: formatUserLabel(candidate) })),
                ]}
              />
              <Button type="button" disabled={busy || !selectedCandidateId} loading={busy} onClick={handleAdd}>{t('Hinzufügen')}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TournamentOwnerPanel({ tournamentId, ownerId, candidates = [], onOwnerChanged }) {
  const { t } = useTranslation();
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');

  const owner = candidates.find((candidate) => candidate.id === ownerId);
  const otherCandidates = candidates.filter((candidate) => candidate.id !== ownerId);

  async function handleChangeOwner(event) {
    event.preventDefault();
    if (!selectedOwnerId) return;
    setBusy(true);
    setPanelError('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournamentId}/owner`, { method: 'PUT', body: JSON.stringify({ userId: selectedOwnerId }) });
      onOwnerChanged(data.tournament);
      setSelectedOwnerId('');
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <span>{t('Owner verwalten')}</span>
      </div>
      <Feedback error={panelError} />
      <p className="muted">
        {t('Aktueller Owner:')} <span data-i18n-skip>{owner ? formatUserLabel(owner) : t('Unbekannter Benutzer')}</span>
      </p>
      {otherCandidates.length > 0 && (
        <div className="inline-form">
          <SelectField
            label={t('Owner wechseln')}
            value={selectedOwnerId}
            onChange={setSelectedOwnerId}
            options={[
              { value: '', label: t('Bitte wählen') },
              ...otherCandidates.map((candidate) => ({ value: candidate.id, label: formatUserLabel(candidate) })),
            ]}
          />
          <Button type="button" disabled={busy || !selectedOwnerId} loading={busy} onClick={handleChangeOwner}>{t('Übernehmen')}</Button>
        </div>
      )}
    </div>
  );
}

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

export function TournamentForm({ form, setForm, onSubmit, onCancel, mode, isAdmin, owner, editorCandidates, ownerCandidates, onOwnerChanged, language, currentUser, boulePlaces = [], saving = false, invalidField = null, clubNames = [] }) {
  const { t } = useTranslation();
  const clubSuggestions = useClubSuggestions(clubNames);
  const [showFormationHelp, setShowFormationHelp] = useState(false);
  const showMailNotEnabledHint = !isAdmin && currentUser && currentUser.mailEnabled === false;
  const canManageEditors = mode === 'edit' && form.id && Boolean(currentUser) && (isAdmin || form.ownerId === currentUser.id);
  const canManageOwner = mode === 'edit' && form.id && isAdmin;
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
        <>
          <TextField label={t('Verein')} value={form.club} onChange={(club) => setForm({ ...form, club })} required minLength={2} list={clubSuggestions.listId} />
          {clubSuggestions.datalist}
        </>
      )}
      <TextField label={t('Name')} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <div className="form-grid">
        <TextField label={t('Datum')} type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} required />
        <TextField label={t('Startzeit')} type="time" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
      </div>
      {boulePlaces.length > 0 && (
        <SelectField
          label={t('Bouleplatz')}
          value={form.boulePlaceId || ''}
          onChange={(boulePlaceId) => {
            const place = boulePlaces.find((entry) => entry.id === boulePlaceId);
            setForm({
              ...form,
              boulePlaceId,
              location: place ? place.address : form.location,
              latitude: place ? place.latitude : form.latitude,
              longitude: place ? place.longitude : form.longitude,
              locationConfirmed: place ? true : form.locationConfirmed,
            });
          }}
          options={[{ value: '', label: t('Individuellen Ort verwenden') }, ...boulePlaces.map((place) => ({ value: place.id, label: `${place.clubName ? `${place.clubName}: ` : ''}${place.name} (${t(place.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')})` }))]}
        />
      )}
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
        disabled={Boolean(form.boulePlaceId)}
      />
      {form.boulePlaceId && <p className="hint">{t('Ort wird vom ausgewählten Bouleplatz übernommen.')}</p>}
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
          options={translatedOptions(FORMATIONS)}
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
                registrationType: formation === 'tete' ? 'forme' : form.registrationType,
              })}
              options={translatedOptions(form.registrationType === 'supermelee' ? FORMATIONS.filter((option) => option.value !== 'tete' && option.value !== 'andere') : FORMATIONS)}
            />
            <SelectField
              label={t('Anmeldetyp')}
              value={form.registrationType}
              onChange={(registrationType) => setForm({
                ...form,
                registrationType,
                type: registrationType === 'supermelee' ? 'rangliste' : form.type,
                formation: registrationType === 'supermelee' && form.formation === 'tete' ? 'doublette' : form.formation,
              })}
              options={translatedOptions(form.formation === 'tete' ? REGISTRATION_TYPES.filter((option) => option.value === 'forme') : REGISTRATION_TYPES)}
              disabled={form.formation === 'tete'}
            />
            <SelectField
              label={t('Turniersystem')}
              value={form.registrationType === 'supermelee' ? 'rangliste' : form.type}
              onChange={(type) => setForm({ ...form, type })}
              options={translatedOptions(TOURNAMENT_TYPES)}
              disabled={form.registrationType === 'supermelee'}
            />
          </div>
          {form.type === 'schweizer' && (
            <SelectField
              label={t('Schweizer Ranglistenmodus')}
              value={form.schweizerRankingMode || 'mit_buchholz'}
              onChange={(schweizerRankingMode) => setForm({ ...form, schweizerRankingMode })}
              options={[
                { value: 'mit_buchholz', label: t('Mit Buchholz und Feinbuchholz') },
                { value: 'ohne_buchholz', label: t('Ohne Buchholz') },
              ]}
              disabled={form.status === 'running' || form.status === 'finished'}
            />
          )}
          {form.type === 'formule_x' && (
            <TextField
              label={t('Anzahl Runden')}
              type="number"
              min="1"
              max="20"
              value={form.formuleXRounds || 4}
              onChange={(formuleXRounds) => setForm({ ...form, formuleXRounds })}
            />
          )}
          {form.type === 'ko' && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.koPlatz3}
                onChange={(event) => setForm({ ...form, koPlatz3: event.target.checked })}
              />
              {t('Spiel um Platz 3 austragen')}
            </label>
          )}
          {showFormationHelp && (
            <FormationHelpDialog onClose={() => setShowFormationHelp(false)} />
          )}
        </>
      )}
      <div className="form-grid">
        <SelectField label={t('Status')} value={form.status} onChange={(status) => setForm({ ...form, status })} options={translatedOptions(TOURNAMENT_STATUSES)} />
        {!isCalendarEntry && (
          <SelectField label={t('Sichtbarkeit')} value={form.visibility} onChange={(visibility) => setForm({ ...form, visibility })} options={translatedOptions(VISIBILITIES)} />
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
          <div className="form form-section">
            <div className="section-title">
              <h3>{t('Ermäßigte Startgelder')}</h3>
              <Button
                type="button"
                variant="secondary"
                disabled={(form.feeTiers || []).length >= 10}
                onClick={() => setForm({ ...form, feeTiers: [...(form.feeTiers || []), { id: crypto.randomUUID(), name: '', amount: '', active: true }] })}
              >
                {t('Tarif hinzufügen')}
              </Button>
            </div>
            {(form.feeTiers || []).map((tier, index) => (
              <div className="form-grid" key={tier.id}>
                <TextField label={t('Tarifname')} value={tier.name} onChange={(name) => setForm({ ...form, feeTiers: form.feeTiers.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item) })} />
                <TextField label={t('Startgeld')} inputMode="decimal" value={tier.amount} onChange={(amount) => setForm({ ...form, feeTiers: form.feeTiers.map((item, itemIndex) => itemIndex === index ? { ...item, amount } : item) })} />
                <label className="checkbox-field">
                  <input type="checkbox" checked={tier.active !== false} onChange={(event) => setForm({ ...form, feeTiers: form.feeTiers.map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item) })} />
                  {t('Für neue Meldungen verfügbar')}
                </label>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setForm({ ...form, feeTiers: form.feeTiers.filter((_, itemIndex) => itemIndex !== index) })}
                >
                  {t('Tarif entfernen')}
                </Button>
              </div>
            ))}
          </div>
          <div className="form form-section">
            <div className="section-title">
              <h3>{t('Zusätzliche Teilnehmerfragen')}</h3>
              <Button
                type="button"
                variant="secondary"
                disabled={(form.registrationQuestions || []).length >= 10}
                onClick={() => setForm({ ...form, registrationQuestions: [...(form.registrationQuestions || []), { id: crypto.randomUUID(), label: '' }] })}
              >
                {t('Frage hinzufügen')}
              </Button>
            </div>
            <p className="hint">{t('Jedem Teilnehmer werden Fragestellungen angeboten')}</p>
            {(form.registrationQuestions || []).map((question, index) => (
              <div className="form-grid" key={question.id}>
                <TextArea
                  label={`${t('Frage')} ${index + 1}`}
                  value={question.label}
                  onChange={(label) => setForm({ ...form, registrationQuestions: form.registrationQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, label } : item) })}
                  required
                  minLength={2}
                  maxLength={250}
                  rows={3}
                />
                <div className="tournament-question-remove">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setForm({ ...form, registrationQuestions: form.registrationQuestions.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    {t('Frage entfernen')}
                  </Button>
                </div>
              </div>
            ))}
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
      <RichTextEditor
        label={t('Beschreibung')}
        value={form.description}
        onChange={(description) => setForm({ ...form, description })}
        boldLabel={t('Fett')}
        italicLabel={t('Kursiv')}
        underlineLabel={t('Unterstrichen')}
        strikeLabel={t('Durchgestrichen')}
        bulletListLabel={t('Aufzählung')}
        orderedListLabel={t('Nummerierte Liste')}
        headingLabel={t('Überschrift')}
      />
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
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={Boolean(form.liveViewEnabled)}
              onChange={(event) => setForm({ ...form, liveViewEnabled: event.target.checked })}
            />
            {t('Live-Ansicht für Teilnehmer: persönlicher Link in der Anmeldebestätigung, Runde, Gegner, Bahn und Push bei neuer Runde')}
          </label>
        </>
      )}
      <TextField label={t('Website')} type="url" placeholder="https://…" value={form.websiteUrl} onChange={(websiteUrl) => setForm({ ...form, websiteUrl })} invalid={invalidField === 'websiteUrl'} />
      <TextField label={t('Logo-Bildlink')} type="url" placeholder="https://…" value={form.logoUrl} onChange={(logoUrl) => setForm({ ...form, logoUrl })} invalid={invalidField === 'logoUrl'} />
      <TextField label={t('Flyer-Bildlink')} type="url" placeholder="https://…" value={form.flyerUrl} onChange={(flyerUrl) => setForm({ ...form, flyerUrl })} invalid={invalidField === 'flyerUrl'} />
      <TextField label={t('WhatsApp-Gruppe (Einladungslink)')} type="url" placeholder="https://chat.whatsapp.com/…" value={form.whatsappGroupUrl} onChange={(whatsappGroupUrl) => setForm({ ...form, whatsappGroupUrl })} invalid={invalidField === 'whatsappGroupUrl'} />
      <p className="hint">{t('Der Link wird in jede E-Mail an die Gemeldeten und ihre Teammitglieder eingefügt und nicht öffentlich angezeigt.')}</p>
      {canManageOwner && (
        <TournamentOwnerPanel tournamentId={form.id} ownerId={form.ownerId} candidates={ownerCandidates} onOwnerChanged={(tournament) => { onOwnerChanged(tournament); setForm({ ...form, ownerId: tournament.ownerId }); }} />
      )}
      {canManageEditors && <TournamentEditorsPanel tournamentId={form.id} candidates={editorCandidates} ownerId={form.ownerId} owner={owner} currentUserId={currentUser?.id} />}
      <div className="dialog-actions">
        <Button variant="secondary" type="button" onClick={onCancel}>{t('Abbrechen')}</Button>
        <Button type="submit" loading={saving}>{mode === 'edit' ? t('Turnier speichern') : t('Turnier anlegen')}</Button>
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
  onDuplicate,
  onDisconnect = () => {},
  onResetRunning = () => {},
  onToggleRegistrationClosed = () => {},
  onEditPublication = () => {},
  isAdmin,
  language,
  onCreate,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  hideCalendarEntries = false,
  onHideCalendarEntriesChange = () => {},
  onResetFilters,
  busyId = '',
  setBusyId = () => {},
  qrSourceTournaments = tournaments,
  currentUserId,
  onQrDesignSaved = () => {},
}) {
  const { t } = useTranslation();
  const filtered = Boolean(query.trim()) || Boolean(statusFilter) || hideCalendarEntries;
  const [shareError, setShareError] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [qrTarget, setQrTarget] = useState(null);
  const [flyerTarget, setFlyerTarget] = useState(null);
  const visibleTournaments = useInfiniteList(hideCalendarEntries ? tournaments.filter((tournament) => !isCalendarEntry(tournament)) : tournaments);

  // Fester Link /q/<qr_token> – derselbe wie im QR-Code, unabhängig von Sichtbarkeit und Freigabe-Link-Status.
  // Bei privaten Turnieren aktiviert der Aufruf zugleich den Freigabe-Link.
  async function tournamentShareUrl(tournament) {
    return (await authenticatedApi(`/api/tournaments/${tournament.id}/share-link`, { method: 'POST' })).shareUrl;
  }

  async function openQrCode(tournament) {
    setBusyId(`qr-${tournament.id}`);
    setShareError('');
    setShareMessage('');
    try {
      // Ein QR-Code für ein privates Turnier ist ein Teilen: Freigabe-Link aktivieren. Der QR-Code selbst nutzt
      // aber immer den festen Link /q/<qr_token>, der sich nie ändert (siehe resolveQrLinkTarget im Worker).
      if (tournament.visibility === 'private') await tournamentShareUrl(tournament);
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/qr-design`);
      setQrTarget({ tournament, url: data.qrUrl, design: data.design });
    } catch (error) {
      setShareError(error.message);
    } finally {
      setBusyId('');
    }
  }

  async function openFlyer(tournament) {
    setBusyId(`flyer-${tournament.id}`);
    setShareError('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/qr-design`);
      setFlyerTarget({ tournament, url: data.qrUrl, design: data.design });
    } catch (error) {
      setShareError(error.message);
    } finally {
      setBusyId('');
    }
  }

  async function shareTournament(tournament) {
    setBusyId(`share-${tournament.id}`);
    setShareError('');
    setShareMessage('');
    try {
      const shareUrl = await tournamentShareUrl(tournament);
      const shareData = { title: tournament.name, text: `${tournament.name}\n${shareUrl}`, url: shareUrl };
      if (navigator.share) await navigator.share(shareData);
      else {
        if (!navigator.clipboard?.writeText) throw new Error(t('Teilen wird von diesem Gerät nicht unterstützt'));
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage(t('Link kopiert'));
      }
    } catch (error) {
      if (error.name !== 'AbortError') setShareError(error.message || t('Teilen wird von diesem Gerät nicht unterstützt'));
    } finally {
      setBusyId('');
    }
  }

  async function disableShareLink(tournament) {
    setBusyId(`disable-${tournament.id}`);
    setShareError('');
    setShareMessage('');
    try {
      await authenticatedApi(`/api/tournaments/${tournament.id}/share-link`, { method: 'DELETE' });
    } catch (error) {
      setShareError(error.message);
    } finally {
      setBusyId('');
    }
  }

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
          { label: t('Status filtern'), value: statusFilter, onChange: onStatusFilterChange, options: [{ value: '', label: t('Alle Status') }, ...translatedOptions(TOURNAMENT_STATUSES)] },
        ]}
        onReset={onResetFilters}
        resetDisabled={!filtered}
      />
      <label className="checkbox-field tournament-list-calendar-filter">
        <input
          type="checkbox"
          checked={hideCalendarEntries}
          onChange={(event) => onHideCalendarEntriesChange(event.target.checked)}
        />
        {t('Kalendereinträge ausblenden')}
      </label>
      <Feedback message={shareMessage} />
      <Feedback error={shareError} />
      <div className="user-list">
        {visibleTournaments.items.map((tournament) => (
          <article className={`data-row tournament-row ${selectedId === tournament.id ? 'selected' : ''}`} key={tournament.id}>
            <button className="row-main" type="button" onClick={() => onSelect(tournament.id)}>
              <strong data-i18n-skip>{tournament.name}</strong>
              {tournament.registrationEnabled === false && <span className="role">{t('Kalendereintrag')}</span>}
              <span>{formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)} · <span data-i18n-skip>{formatLocationAddress(tournament.location)}</span></span>
              {tournament.registrationEnabled !== false && (
                <small>{formationLabel(tournament)} · {labelFor(REGISTRATION_TYPES, tournament.registrationType)} · {labelFor(TOURNAMENT_TYPES, tournament.type)}</small>
              )}
              {tournament.owner && (
                <small>{t('Owner:')} <span data-i18n-skip>{formatUserName(tournament.owner)}{tournament.owner.username && <span className="user-handle"> @{tournament.owner.username}</span>}</span></small>
              )}
              {isAdmin && tournament.editors?.length > 0 && (
                <small>{t('Bearbeiter:')} <span data-i18n-skip>{tournament.editors.map((editor) => `${editor.firstName || ''} ${editor.lastName || ''}`.trim()).join(', ')}</span></small>
              )}
            </button>
            <div className="badges">
              {tournament.registrationEnabled === false ? (
                <span className={`status ${tournament.status === 'draft' ? 'status-draft' : 'status-calendar'}`}>
                  {t(tournament.status === 'draft' ? 'Unsichtbar' : 'Sichtbar')}
                </span>
              ) : (
                <>
                  <span className={`status status-${tournament.status}`}>
                    {tournament.registrationClosed && tournament.status === 'registration'
                      ? t('Anmeldung geschlossen')
                      : labelFor(TOURNAMENT_STATUSES, tournament.status)}
                  </span>
                  <span className="role">{tournament.activeRegistrations}/{tournament.maxRegistrations || '∞'}</span>
                  {tournament.waitlistRegistrations > 0 && <span className="role role-user">{tournament.waitlistRegistrations} {t('Warteliste')}</span>}
                </>
              )}
            </div>
            {tournament.canManage && (
              <div className="row-actions">
                {tournament.documentManaged ? (
                  <>
                    <span className="muted">{t('Eckdaten im Turnierdokument')}</span>
                    <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => onEditPublication(tournament)}>{t('Status ändern')}</Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => onEdit(tournament)}>{t('Bearbeiten')}</Button>
                )}
                <Button
                  variant="secondary"
                  loading={busyId === `flyer-${tournament.id}`}
                  disabled={Boolean(busyId) && busyId !== `flyer-${tournament.id}`}
                  onClick={() => openFlyer(tournament)}
                >
                  {t('Flyer erstellen')}
                </Button>
                {(tournament.status !== 'draft' || tournament.visibility === 'private') && (
                  <Button
                    variant="secondary"
                    loading={busyId === `share-${tournament.id}`}
                    disabled={Boolean(busyId) && busyId !== `share-${tournament.id}`}
                    onClick={() => shareTournament(tournament)}
                  >
                    {t('Turnier teilen')}
                  </Button>
                )}
                {tournament.registrationEnabled !== false && (tournament.status !== 'draft' || tournament.visibility === 'private') && (
                  <Button
                    variant="secondary"
                    loading={busyId === `qr-${tournament.id}`}
                    disabled={Boolean(busyId) && busyId !== `qr-${tournament.id}`}
                    onClick={() => openQrCode(tournament)}
                  >
                    {t('QR-Code')}
                  </Button>
                )}
                {tournament.visibility === 'private' && (
                  <Button
                    variant="secondary"
                    loading={busyId === `disable-${tournament.id}`}
                    disabled={Boolean(busyId) && busyId !== `disable-${tournament.id}`}
                    onClick={() => disableShareLink(tournament)}
                  >
                    {t('Freigabe-Link deaktivieren')}
                  </Button>
                )}
                {isDocumentBound(tournament) && (
                  <Button
                    variant="secondary"
                    loading={busyId === `disconnect-${tournament.id}`}
                    disabled={Boolean(busyId) && busyId !== `disconnect-${tournament.id}`}
                    onClick={() => onDisconnect(tournament)}
                  >
                    {t('Vom Turnierdokument trennen')}
                  </Button>
                )}
                {tournament.status === 'running' && (
                  <Button
                    variant="secondary"
                    loading={busyId === `reset-running-${tournament.id}`}
                    disabled={Boolean(busyId) && busyId !== `reset-running-${tournament.id}`}
                    onClick={() => onResetRunning(tournament)}
                  >
                    {t('Laufstatus zurücksetzen')}
                  </Button>
                )}
                {tournament.status === 'registration' && tournament.registrationEnabled !== false && (
                  <Button
                    variant="secondary"
                    loading={busyId === `registration-closed-${tournament.id}`}
                    disabled={Boolean(busyId) && busyId !== `registration-closed-${tournament.id}`}
                    onClick={() => onToggleRegistrationClosed(tournament)}
                  >
                    {tournament.registrationClosed ? t('Anmeldung öffnen') : t('Anmeldung schließen')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  loading={busyId === `duplicate-${tournament.id}`}
                  disabled={Boolean(busyId) && busyId !== `duplicate-${tournament.id}`}
                  onClick={() => onDuplicate(tournament)}
                >
                  {t('Duplizieren')}
                </Button>
                <Button
                  variant="danger"
                  loading={busyId === `delete-${tournament.id}`}
                  disabled={Boolean(busyId) && busyId !== `delete-${tournament.id}`}
                  onClick={() => onDelete(tournament)}
                >
                  {t('Löschen')}
                </Button>
              </div>
            )}
          </article>
        ))}
        {tournaments.length === 0 && <p className="muted">{t('Keine Turniere gefunden.')}</p>}
      </div>
      <InfiniteListLoadMore hasMore={visibleTournaments.hasMore} onLoadMore={visibleTournaments.loadMore} label={t('Weitere Einträge laden')} />
      {qrTarget && (
        <TournamentQrDialog
          tournament={qrTarget.tournament}
          url={qrTarget.url}
          initialDesign={qrTarget.design}
          sourceTournaments={qrSourceTournaments}
          currentUserId={currentUserId}
          onSaved={onQrDesignSaved}
          onClose={() => setQrTarget(null)}
        />
      )}
      {flyerTarget && <TournamentFlyerDialog tournament={flyerTarget.tournament} qrUrl={flyerTarget.url} qrDesign={flyerTarget.design} currentUserId={currentUserId} onClose={() => setFlyerTarget(null)} />}
    </div>
  );
}

function tournamentToForm(tournament) {
  return {
    id: tournament.id,
    ownerId: tournament.ownerId || '',
    creatorId: tournament.creatorId || '',
    name: tournament.name || '',
    date: tournament.date || '',
    startTime: tournament.startTime || '',
    location: tournament.location || '',
    latitude: tournament.latitude ?? '',
    longitude: tournament.longitude ?? '',
    overrideCoordinates: false,
    locationConfirmed: false,
    description: tournament.description || '',
    type: tournament.type || 'formule_x',
    formation: tournament.formationOther ? 'andere' : (tournament.formation || 'doublette'),
    registrationType: tournament.registrationType || 'forme',
    schweizerRankingMode: tournament.schweizerRankingMode || 'mit_buchholz',
    formuleXRounds: tournament.formuleXRounds || 4,
    koPlatz3: tournament.koPlatz3 === undefined ? true : Boolean(tournament.koPlatz3),
    status: tournament.status || 'draft',
    maxRegistrations: tournament.maxRegistrations || 0,
    registrationDeadline: utcIsoToZonedDateTimeInput(tournament.registrationDeadline, tournament.timezone),
    registrationOpensAt: utcIsoToZonedDateTimeInput(tournament.registrationOpensAt, tournament.timezone),
    timezone: tournament.timezone || '',
    entryFeeAmount: minorUnitsToAmount(tournament.entryFeeCents, tournament.currency || 'EUR'),
    feeTiers: (tournament.feeTiers || []).filter((tier) => tier.id !== 'legacy-standard').map((tier) => ({ ...tier, amount: minorUnitsToAmount(tier.amountCents, tournament.currency || 'EUR') })),
    registrationQuestions: tournament.registrationQuestions || [],
    currency: tournament.currency || 'EUR',
    contactName: tournament.contactName || '',
    contactEmail: tournament.contactEmail || '',
    contactPhone: tournament.contactPhone || '',
    visibility: tournament.visibility || 'private',
    internalNotes: tournament.internalNotes || '',
    club: tournament.club || '',
    participantsPublic: Boolean(tournament.participantsPublic),
    liveViewEnabled: Boolean(tournament.liveViewEnabled),
    approvalRequired: Boolean(tournament.approvalRequired),
    licenseRequired: Boolean(tournament.licenseRequired),
    teamNameEnabled: Boolean(tournament.teamNameEnabled),
    waitlistEnabled: tournament.waitlistEnabled === undefined ? true : Boolean(tournament.waitlistEnabled),
    registrationEnabled: tournament.registrationEnabled === undefined ? true : Boolean(tournament.registrationEnabled),
    websiteUrl: tournament.websiteUrl || '',
    logoUrl: tournament.logoUrl || '',
    flyerUrl: tournament.flyerUrl || '',
    whatsappGroupUrl: tournament.whatsappGroupUrl || '',
  };
}

export function TournamentManagementPage({
  tournaments = [],
  isAdmin,
  language,
  currentUser,
  boulePlaces = [],
  postboxRecipients = [],
  selectedTournamentId,
  setSelectedTournamentId,
  onTournamentsChanged,
  clubNames = [],
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hideCalendarEntries, setHideCalendarEntries] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_TOURNAMENT_FORM);
  const [mode, setMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [invalidField, setInvalidField] = useState(null);
  const [publication, setPublication] = useState(null);
  const [publicationError, setPublicationError] = useState('');
  const [publicationSaving, setPublicationSaving] = useState(false);

  const manageableTournaments = useMemo(() => tournaments.filter((tournament) => tournament.canManage), [tournaments]);
  const filteredTournaments = useMemo(
    () => filterTournaments(manageableTournaments, query, statusFilter),
    [manageableTournaments, query, statusFilter],
  );

  function clearFeedback() {
    setError('');
    setMessage('');
    setInvalidField(null);
  }

  function openCreate() {
    setMode('create');
    setForm({
      ...EMPTY_TOURNAMENT_FORM,
      contactName: currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '',
      contactEmail: currentUser?.email || '',
      contactPhone: currentUser?.phone || '',
    });
    clearFeedback();
    setDialogOpen(true);
  }

  function openEdit(tournament) {
    setMode('edit');
    setForm(tournamentToForm(tournament));
    clearFeedback();
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setMode('create');
    setForm(EMPTY_TOURNAMENT_FORM);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const payload = tournamentPayload(form);

    setSaving(true);
    try {
      let data;
      if (mode === 'edit') {
        data = await authenticatedApi(`/api/tournaments/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        await authenticatedApi(`/api/tournaments/${data.tournament.id}/presentation`, {
          method: 'PUT',
          body: JSON.stringify({
            websiteUrl: form.websiteUrl,
            logoUrl: form.logoUrl,
            flyerUrl: form.flyerUrl,
            whatsappGroupUrl: form.whatsappGroupUrl,
          }),
        });
      } else {
        data = await authenticatedApi('/api/tournaments', { method: 'POST', body: JSON.stringify(payload) });
      }

      setMessage(mode === 'edit' ? t('Turnier wurde aktualisiert.') : t('Turnier wurde angelegt.'));
      closeDialog();
      await onTournamentsChanged?.();
      setSelectedTournamentId(data.tournament.id);
    } catch (requestError) {
      setError(requestError.message);
      setInvalidField(requestError.payload?.details?.field || null);
    } finally {
      setSaving(false);
    }
  }

  function openPublication(tournament) {
    setPublicationError('');
    setPublication({ id: tournament.id, name: tournament.name, currentStatus: tournament.status, status: tournament.status, visibility: tournament.visibility });
  }

  async function handlePublicationSubmit(event) {
    event.preventDefault();
    setPublicationError('');
    setPublicationSaving(true);
    try {
      await authenticatedApi(`/api/tournaments/${publication.id}/publication`, {
        method: 'PUT',
        body: JSON.stringify({ status: publication.status, visibility: publication.visibility }),
      });
      setPublication(null);
      await onTournamentsChanged?.();
    } catch (requestError) {
      setPublicationError(requestError.message);
    } finally {
      setPublicationSaving(false);
    }
  }

  async function handleOwnerChanged() {
    await onTournamentsChanged?.();
  }

  async function handleDuplicate(tournament) {
    setError('');
    setMessage('');
    setBusyId(`duplicate-${tournament.id}`);
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/duplicate`, { method: 'POST' });
      setMessage(`${t('Turnier wurde als Kopie angelegt:')} ${data.tournament.name}`);
      await onTournamentsChanged?.();
      setSelectedTournamentId(data.tournament.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleDisconnect(tournament) {
    const question = t('Turnier „{name}“ vom Turnierdokument trennen? Das Turnierdokument kann danach nichts mehr übertragen. Meldeliste, Runden und Rangliste werden ab dann online geführt; bisher übertragene Runden bleiben erhalten.').replace('{name}', tournament.name);
    if (!window.confirm(question)) {
      return;
    }

    setError('');
    setMessage('');
    setBusyId(`disconnect-${tournament.id}`);
    try {
      await authenticatedApi(`/api/tournaments/${tournament.id}/disconnect`, { method: 'POST' });
      setMessage(t('Turnier wurde vom Turnierdokument getrennt und wird online weitergeführt.'));
      await onTournamentsChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleResetRunning(tournament) {
    const question = t('Laufstatus von „{name}“ zurücksetzen? Das geht nur, solange online noch kein Rundenergebnis vorliegt. Die Anmeldung bleibt danach geschlossen, bis du sie wieder öffnest.').replace('{name}', tournament.name);
    if (!window.confirm(question)) {
      return;
    }

    setError('');
    setMessage('');
    setBusyId(`reset-running-${tournament.id}`);
    try {
      await authenticatedApi(`/api/tournaments/${tournament.id}/reset-running`, { method: 'POST' });
      setMessage(t('Laufstatus wurde zurückgesetzt. Die Anmeldung ist geschlossen.'));
      await onTournamentsChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleToggleRegistrationClosed(tournament) {
    const closed = !tournament.registrationClosed;
    setError('');
    setMessage('');
    setBusyId(`registration-closed-${tournament.id}`);
    try {
      await authenticatedApi(`/api/tournaments/${tournament.id}/registration-closed`, {
        method: 'PUT',
        body: JSON.stringify({ closed }),
      });
      setMessage(closed ? t('Anmeldung wurde geschlossen.') : t('Anmeldung wurde geöffnet.'));
      await onTournamentsChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function handleDelete(tournament) {
    const documentManaged = Boolean(tournament.documentManaged);
    if (!window.confirm(deleteTournamentConfirmation(t, tournament, documentManaged))) {
      return;
    }

    setError('');
    setMessage('');
    setBusyId(`delete-${tournament.id}`);
    try {
      try {
        await deleteTournamentRequest(tournament.id, documentManaged);
      } catch (requestError) {
        if (!isDocumentManagedConflict(requestError)) throw requestError;
        // Erst nach dem Laden der Liste verbunden: mit Warnung erneut fragen.
        if (!window.confirm(deleteTournamentConfirmation(t, tournament, true))) return;
        await deleteTournamentRequest(tournament.id, true);
      }
      setMessage(t('Turnier wurde gelöscht.'));
      setSelectedTournamentId('');
      await onTournamentsChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      {!dialogOpen && (
        <>
          <Feedback message={message} />
          <Feedback error={error} />
        </>
      )}
      <TournamentList
        tournaments={filteredTournaments}
        totalTournaments={manageableTournaments.length}
        selectedId={selectedTournamentId}
        onSelect={setSelectedTournamentId}
        onEdit={openEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onDisconnect={handleDisconnect}
        onResetRunning={handleResetRunning}
        onToggleRegistrationClosed={handleToggleRegistrationClosed}
        onEditPublication={openPublication}
        isAdmin={isAdmin}
        language={language}
        onCreate={openCreate}
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        hideCalendarEntries={hideCalendarEntries}
        onHideCalendarEntriesChange={setHideCalendarEntries}
        onResetFilters={() => { setQuery(''); setStatusFilter(''); setHideCalendarEntries(false); }}
        busyId={busyId}
        setBusyId={setBusyId}
        qrSourceTournaments={manageableTournaments}
        currentUserId={currentUser?.id}
        onQrDesignSaved={onTournamentsChanged}
      />

      <EditDialog
        open={dialogOpen}
        wide
        title={mode === 'edit' ? t('Turnier bearbeiten') : t('Turnier anlegen')}
        message={message}
        error={error}
        onClose={closeDialog}
      >
        <TournamentForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onCancel={closeDialog}
          mode={mode}
          isAdmin={isAdmin}
          owner={tournaments.find((item) => item.id === form.id)?.owner}
          editorCandidates={postboxRecipients.filter((recipient) => recipient.id !== form.ownerId)}
          ownerCandidates={postboxRecipients}
          onOwnerChanged={handleOwnerChanged}
          language={language}
          currentUser={currentUser}
          boulePlaces={boulePlaces}
          saving={saving}
          invalidField={invalidField}
          clubNames={clubNames}
        />
      </EditDialog>

      <EditDialog
        open={Boolean(publication)}
        title={t('Status und Sichtbarkeit')}
        subtitle={publication?.name}
        error={publicationError}
        onClose={() => setPublication(null)}
      >
        {publication && (
          <form onSubmit={handlePublicationSubmit}>
            <div className="form-grid">
              <SelectField
                label={t('Status')}
                value={publication.status}
                onChange={(status) => setPublication({ ...publication, status })}
                options={translatedOptions(publicationStatusOptions(publication.currentStatus))}
              />
              <SelectField
                label={t('Sichtbarkeit')}
                value={publication.visibility}
                onChange={(visibility) => setPublication({ ...publication, visibility })}
                options={translatedOptions(VISIBILITIES)}
              />
            </div>
            <div className="dialog-actions">
              <Button variant="secondary" type="button" onClick={() => setPublication(null)}>{t('Abbrechen')}</Button>
              <Button type="submit" loading={publicationSaving}>{t('Speichern')}</Button>
            </div>
          </form>
        )}
      </EditDialog>

    </>
  );
}

// "Läuft" setzt nur der Turnierstart; ein laufendes Turnier kann nur noch abgeschlossen werden.
function publicationStatusOptions(currentStatus) {
  const allowed = currentStatus === 'running' ? ['running', 'finished'] : ['draft', 'registration', 'finished'];
  return TOURNAMENT_STATUSES.filter((option) => allowed.includes(option.value));
}

export default TournamentManagementPage;
