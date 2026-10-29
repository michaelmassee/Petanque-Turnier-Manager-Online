import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { registrationPayload } from '../lib/domain.js';
import { Button, EditDialog } from './ui.jsx';
import { RegistrationFields } from './RegistrationFields.jsx';
import { TournamentPicker } from './TournamentPicker.jsx';

export function RegistrationForm({ form, setForm, onSubmit, onCancel, tournaments, selectedTournamentId, manageMode, invalidField, saving = false, currentUserId, clubNames, turnstileSiteKey }) {
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
        playerSearchEnabled={Boolean(currentUserId)}
        currentUserId={currentUserId}
        turnstileSiteKey={turnstileSiteKey}
        tournamentId={selectedValue}
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

export function registrationToForm(registration) {
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
    phone: registration.phone || '',
    feeSelections: registration.feeSelections || [],
    registrationAnswers: registration.registrationAnswers || [],
    teamName: registration.teamName || '',
    seedingPosition: registration.seedingPosition || '',
    status: registration.status || 'pending',
    isVip: Boolean(registration.isVip),
  };
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
      <p className="hint">{t('👤 zeigt, wer mit einem Benutzerkonto verknüpft ist. Änderst du die E-Mail einer verknüpften Person, bleibt ihr bisheriges Konto verknüpft – so landet die Anmeldung nicht durch einen Tippfehler bei einer fremden Person. Konto wechseln: E-Mail korrigieren und speichern, dann hier „Konto neu zuordnen“ klicken. Gibt es zu der E-Mail kein bestätigtes Konto, wird die Verknüpfung entfernt.')}</p>
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

// "Live-Link erneut senden" (EW-02): derselbe Link an die Spieler; er gilt für das ganze Team und bleibt gültig. Nur ein
// alter, nicht wiederherstellbarer Link wird nach einem Hinweis durch einen neuen ersetzt (wie im QR-Dialog).
function LiveLinkResend({ registration, busyId, notRecoverable, onResend }) {
  const { t } = useTranslation();
  if (!registration || registration.status !== 'confirmed') return null;
  return (
    <section className="relink-accounts" aria-label={t('Live-Link')}>
      <h3>{t('Live-Link')}</h3>
      {notRecoverable ? (
        <>
          <p className="hint">{t('Der bisherige Live-Link dieser Meldung kann nicht erneut verschickt werden, weil er vor dieser Funktion erstellt wurde. Ein neuer Link macht den bisherigen für das ganze Team ungültig.')}</p>
          <div className="row-actions">
            <Button variant="secondary" loading={busyId === 'live-link'} disabled={Boolean(busyId)} onClick={() => onResend(registration, { renew: true })}>
              {t('Neuen Live-Link senden')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">{t('Schickt den Spielern den bestehenden Live-Link noch einmal per E-Mail. Er gilt für das ganze Team und bleibt gültig.')}</p>
          <div className="row-actions">
            <Button variant="secondary" loading={busyId === 'live-link'} disabled={Boolean(busyId)} onClick={() => onResend(registration)}>
              {t('Live-Link erneut senden')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// „Anmeldung bearbeiten“: gemeinsamer Dialog für Anmeldeverwaltung und Turnierdurchführung. Nach dem Speichern meldet
// onSaved die Erfolgsmeldung an die Seite (der Dialog schließt); Konto-Zuordnung und Live-Link bleiben im offenen Dialog.
export function RegistrationEditDialog({ registration, tournament, tournaments, language, turnstileSiteKey, currentUserId, clubNames, onClose, onSaved, onChanged, children }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_REGISTRATION_FORM);
  const [invalidField, setInvalidField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [liveLinkNotRecoverable, setLiveLinkNotRecoverable] = useState(false);
  // Nur beim Öffnen bzw. Wechsel der Meldung neu befüllen, nicht bei jedem Neuladen der Liste (sonst gehen Eingaben verloren).
  const [loadedId, setLoadedId] = useState(null);
  const registrationId = registration?.id || null;
  if (registrationId !== loadedId) {
    setLoadedId(registrationId);
    if (registration) setForm(registrationToForm(registration));
    setInvalidField(null); setError(''); setMessage(''); setLiveLinkNotRecoverable(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(''); setMessage(''); setInvalidField(null);
    const payload = registrationPayload({ ...form, tournamentId: form.tournamentId || registration.tournamentId }, language);
    setSaving(true);
    try {
      await authenticatedApi(`/api/registrations/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await onSaved?.(t('Anmeldung wurde aktualisiert.'));
    } catch (err) {
      const conflictName = err.payload?.details?.name;
      setError(conflictName ? `${err.message} ("${conflictName}")` : err.message);
      setInvalidField(err.payload?.details?.field || null);
    } finally {
      setSaving(false);
    }
  }

  // "Konto neu zuordnen" (KP-11): einziger Weg, das Konto eines bereits verknüpften Slots zu wechseln.
  async function handleRelink(target, slot) {
    setError(''); setMessage('');
    setBusyId(`relink-${slot}`);
    try {
      const result = await authenticatedApi(`/api/registrations/${target.id}/slots/${slot}/relink`, { method: 'POST' });
      setMessage(result.linked ? t('Das Konto wurde neu zugeordnet.') : t('Zur gespeicherten E-Mail gibt es kein eindeutiges bestätigtes Konto; die Verknüpfung wurde gelöst.'));
      await onChanged?.();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  }

  async function handleLiveLinkResend(target, { renew = false } = {}) {
    setError(''); setMessage('');
    setBusyId('live-link');
    try {
      await authenticatedApi(`/api/registrations/${target.id}/live-link`, { method: 'POST', body: JSON.stringify({ renew }) });
      setLiveLinkNotRecoverable(false);
      setMessage(renew ? t('Ein neuer Live-Link wurde an die Spieler geschickt.') : t('Der Live-Link wurde erneut an die Spieler geschickt.'));
    } catch (err) {
      if (err.payload?.details?.code === 'live_link_not_recoverable') setLiveLinkNotRecoverable(true);
      else setError(err.message);
    } finally { setBusyId(''); }
  }

  return (
    <EditDialog open={Boolean(registration)} wide title={t('Anmeldung bearbeiten')} message={message} error={error} onClose={onClose}>
      <RegistrationForm
        turnstileSiteKey={turnstileSiteKey}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        onCancel={onClose}
        tournaments={tournaments}
        selectedTournamentId={registration?.tournamentId}
        manageMode
        invalidField={invalidField}
        saving={saving}
        currentUserId={currentUserId}
        clubNames={clubNames}
      />
      {children}
      <RelinkAccounts registration={registration} busyId={busyId} onRelink={handleRelink} />
      <LiveLinkResend registration={registration} busyId={busyId} notRecoverable={liveLinkNotRecoverable} onResend={handleLiveLinkResend} />
    </EditDialog>
  );
}
