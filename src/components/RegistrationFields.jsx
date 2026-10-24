import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { REGISTRATION_STATUSES } from '../lib/constants.js';
import { translatedOptions } from '../lib/domain.js';
import { formatMoney } from '../lib/format.js';
import { IntegerField, SelectField, TextField } from './ui.jsx';
import { RegistrationPlayerPicker } from './RegistrationPlayerPicker.jsx';
import { useClubSuggestions } from './ClubSuggestions.jsx';

function ParticipantQuestions({ participant, questions, answers, onChange }) {
  if (questions.length === 0) return null;
  return (
    <div className="participant-questions">
      {questions.map((question) => {
        const checked = answers.some((answer) => answer.participant === participant && answer.questionId === question.id && answer.checked);
        return (
          <label className="checkbox-field" key={question.id} data-i18n-skip>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(question.id, event.target.checked)} />
            <span className="registration-question-label">{question.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function RegistrationSection({ title, children, className = '' }) {
  return (
    <section className={`registration-section ${className}`.trim()}>
      <h3>{title}</h3>
      <div className="registration-section-content">{children}</div>
    </section>
  );
}

// clubNames: veröffentlichte Vereine als Vorschläge für die Vereinsfelder (Freitext bleibt möglich).
export function RegistrationFields({ form, setForm, showStatus, formation, registrationType, licenseRequired, phoneRequired = false, teamNameEnabled, feeTiers = [], registrationQuestions = [], currency = 'EUR', invalidField, clubNames = [], playerSearchEnabled = false, turnstileSiteKey, tournamentId, shareToken = '', currentUserId, currentUser }) {
  const { t, i18n } = useTranslation();
  const clubSuggestions = useClubSuggestions(clubNames);
  const clubList = clubSuggestions.listId;
  const isDrawnTeam = registrationType === 'melee' || registrationType === 'supermelee';
  const allowsPartner = isDrawnTeam ? false : (formation ? formation !== 'tete' : true);
  const allowsPartner2 = isDrawnTeam ? false : formation === 'triplette';
  const showMeleeNotice = isDrawnTeam && formation && formation !== 'tete';
  const selections = form.playerSelections || {};
  const selectedIds = Object.values(selections).map((selection) => selection.userId);
  function selectPlayer(slot, player) {
    setForm((current) => {
      const prefix = slot === 'primary' ? '' : slot;
      const field = (suffix) => prefix ? `${prefix}${suffix}` : suffix[0].toLowerCase() + suffix.slice(1);
      return { ...current,
        [field('FirstName')]: player.firstName, [field('LastName')]: player.lastName,
        [slot === 'primary' ? 'playerEmail' : field('Email')]: player.email,
        [field('Club')]: player.club || '', [field('LicenseNr')]: player.licenseNr || '',
        ...(slot === 'primary' ? { noEmail: false } : {}),
        playerSelections: { ...current.playerSelections, [slot]: { userId: player.id, proof: player.proof, licenseNr: player.licenseNr } },
      };
    });
  }
  function clearPlayer(slot) {
    setForm((current) => ({ ...current, playerSelections: Object.fromEntries(Object.entries(current.playerSelections || {}).filter(([key]) => key !== slot)) }));
  }
  const names = (slot) => {
    const first = slot === 'primary' ? 'firstName' : `${slot}FirstName`;
    const last = slot === 'primary' ? 'lastName' : `${slot}LastName`;
    const firstRequired = slot !== 'partner2' || Boolean(form.partner2LastName);
    const lastRequired = slot !== 'partner2' || Boolean(form.partner2FirstName);
    if (playerSearchEnabled && tournamentId) return <RegistrationPlayerPicker
      key={`${tournamentId}:${slot}`} tournamentId={tournamentId} siteKey={turnstileSiteKey} shareToken={shareToken}
      selected={selections[slot]} excludedIds={selectedIds}
      currentUserId={currentUserId} currentUser={currentUser}
      firstName={form[first]} lastName={form[last]} firstRequired={firstRequired} lastRequired={lastRequired}
      invalid={invalidField === first}
      onNameChange={(field, value) => setForm((current) => ({ ...current, [field === 'firstName' ? first : last]: value }))}
      onSelect={(player) => selectPlayer(slot, player)} onClear={() => clearPlayer(slot)} />;
    return <div className="form-grid">
      <TextField label={t('Vorname')} value={form[first]} onChange={(value) => setForm({ ...form, [first]: value })} required={firstRequired} minLength={2} invalid={invalidField === first} />
      <TextField label={t('Nachname')} value={form[last]} onChange={(value) => setForm({ ...form, [last]: value })} required={lastRequired} minLength={2} invalid={invalidField === first} />
    </div>;
  };

  // Ohne Ermäßigung (nur ein wählbarer Tarif) gibt es nichts auszuwählen - die Auswahl
  // entfällt und der einzige aktive Tarif wird automatisch zugeordnet, damit das Startgeld
  // trotzdem erfasst wird. Deaktivierte Tarife zählen nicht mit (für neue Meldungen ohnehin
  // nicht wählbar).
  const activeFeeTiers = feeTiers.filter((tier) => tier.active !== false);
  const soleTierId = activeFeeTiers.length === 1 ? activeFeeTiers[0].id : null;
  const showFeeSelect = activeFeeTiers.length > 1;
  const selectedFee = (participant) => (form.feeSelections || []).find((selection) => selection.participant === participant)?.tariffId || '';
  const setSelectedFee = (participant, tariffId) => setForm({
    ...form,
    feeSelections: [...(form.feeSelections || []).filter((selection) => selection.participant !== participant), ...(tariffId ? [{ participant, tariffId }] : [])],
  });
  const setQuestionAnswer = (participant, questionId, checked) => setForm({
    ...form,
    registrationAnswers: [
      ...(form.registrationAnswers || []).filter((answer) => answer.participant !== participant || answer.questionId !== questionId),
      ...(checked ? [{ participant, questionId, checked: true }] : []),
    ],
  });
  const feeOptions = (participant) => {
    const selected = selectedFee(participant);
    const historical = (form.feeSelections || []).find((selection) => selection.participant === participant);
    const tiers = feeTiers
      .filter((tier) => tier.active !== false || tier.id === selected)
      .map((tier) => ({ value: tier.id, label: `${tier.name} – ${formatMoney(tier.amountCents, currency, i18n.language)}` }));
    if (historical && !tiers.some((tier) => tier.value === selected)) {
      tiers.push({ value: selected, label: `${historical.name} – ${formatMoney(historical.amountCents, currency, i18n.language)}` });
    }
    return [{ value: '', label: t('Kein Startgeld ausgewählt') }, ...tiers];
  };

  useEffect(() => {
    if (!allowsPartner && (form.playerSelections?.partner || form.playerSelections?.partner2 || form.partnerFirstName || form.partnerLastName || form.partnerEmail || form.partnerClub || form.partnerLicenseNr || form.partner2FirstName || form.partner2LastName || form.partner2Email || form.partner2Club || form.partner2LicenseNr)) {
      setForm((current) => ({
        ...current,
        playerSelections: Object.fromEntries(Object.entries(current.playerSelections || {}).filter(([slot]) => slot === 'primary')),
        partnerFirstName: '', partnerLastName: '', partnerEmail: '', partnerClub: '', partnerLicenseNr: '',
        partner2FirstName: '', partner2LastName: '', partner2Email: '', partner2Club: '', partner2LicenseNr: '',
        feeSelections: (current.feeSelections || []).filter((selection) => selection.participant !== 'partner' && selection.participant !== 'partner2'),
        registrationAnswers: (current.registrationAnswers || []).filter((answer) => answer.participant !== 'partner' && answer.participant !== 'partner2'),
      }));
    } else if (allowsPartner && !allowsPartner2 && (form.playerSelections?.partner2 || form.partner2FirstName || form.partner2LastName || form.partner2Email || form.partner2Club || form.partner2LicenseNr)) {
      setForm((current) => ({
        ...current,
        playerSelections: Object.fromEntries(Object.entries(current.playerSelections || {}).filter(([slot]) => slot !== 'partner2')),
        partner2FirstName: '', partner2LastName: '', partner2Email: '', partner2Club: '', partner2LicenseNr: '',
        feeSelections: (current.feeSelections || []).filter((selection) => selection.participant !== 'partner2'),
        registrationAnswers: (current.registrationAnswers || []).filter((answer) => answer.participant !== 'partner2'),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowsPartner, allowsPartner2]);

  useEffect(() => {
    if (!licenseRequired && (form.licenseNr || form.partnerLicenseNr || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, licenseNr: current.playerSelections?.primary?.licenseNr || '', partnerLicenseNr: current.playerSelections?.partner?.licenseNr || '', partner2LicenseNr: current.playerSelections?.partner2?.licenseNr || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseRequired]);

  useEffect(() => {
    if (!soleTierId) return;
    const wanted = ['primary', ...(allowsPartner ? ['partner'] : []), ...(allowsPartner2 ? ['partner2'] : [])];
    setForm((current) => {
      const existing = current.feeSelections || [];
      const missing = wanted.filter((participant) => !existing.some((selection) => selection.participant === participant));
      if (missing.length === 0) return current;
      return { ...current, feeSelections: [...existing, ...missing.map((participant) => ({ participant, tariffId: soleTierId }))] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleTierId, allowsPartner, allowsPartner2]);

  return (
    <>
      {(teamNameEnabled || showMeleeNotice) && (
        <RegistrationSection title={t('Team und Spielweise')}>
          {teamNameEnabled && <TextField label={t('Teamname')} value={form.teamName} onChange={(teamName) => setForm({ ...form, teamName })} invalid={invalidField === 'teamName'} />}
          {showMeleeNotice && (
            <p className="muted">
              {registrationType === 'supermelee'
                ? t('Dieses Turnier wird als Supermêlée gespielt – die Teams werden vor jeder Runde neu ausgelost.')
                : t('Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.')}
            </p>
          )}
        </RegistrationSection>
      )}
      {clubSuggestions.datalist}
      <RegistrationSection title={t('Spieler 1')}>
        {names('primary')}
        <ParticipantQuestions participant="primary" questions={registrationQuestions} answers={form.registrationAnswers || []} onChange={(questionId, checked) => setQuestionAnswer('primary', questionId, checked)} />
        {!(showStatus && form.noEmail) && <TextField label={t('E-Mail')} type="email" readOnly={Boolean(selections.primary)} value={form.playerEmail || ''} onChange={(playerEmail) => setForm({ ...form, playerEmail })} required />}
        <TextField label={t('Telefonnummer für Rückfragen der Turnierleitung')} type="tel" autoComplete="tel" value={form.phone || ''} onChange={(phone) => setForm({ ...form, phone })} required={phoneRequired} invalid={invalidField === 'phone'} />
        <div className="form-grid">
          <TextField label={t('Verein')} readOnly={Boolean(selections.primary)} value={form.club} onChange={(club) => setForm({ ...form, club })} list={clubList} />
          {(licenseRequired || selections.primary?.licenseNr) && <TextField label={t('Lizenznummer')} readOnly={Boolean(selections.primary?.licenseNr)} value={form.licenseNr} onChange={(licenseNr) => setForm({ ...form, licenseNr })} required={licenseRequired} />}
        </div>
        {showFeeSelect && <SelectField label={t('Startgeld')} value={selectedFee('primary')} onChange={(tariffId) => setSelectedFee('primary', tariffId)} options={feeOptions('primary')} />}
      </RegistrationSection>
      {allowsPartner && (
        <RegistrationSection title={t('Spieler 2')}>
          {names('partner')}
          <ParticipantQuestions participant="partner" questions={registrationQuestions} answers={form.registrationAnswers || []} onChange={(questionId, checked) => setQuestionAnswer('partner', questionId, checked)} />
          <TextField label={t('E-Mail')} type="email" readOnly={Boolean(selections.partner)} value={form.partnerEmail} onChange={(partnerEmail) => setForm({ ...form, partnerEmail })} />
          <div className="form-grid">
            <TextField label={t('Verein')} readOnly={Boolean(selections.partner)} value={form.partnerClub} onChange={(partnerClub) => setForm({ ...form, partnerClub })} list={clubList} />
            {(licenseRequired || selections.partner?.licenseNr) && <TextField label={t('Lizenznummer')} readOnly={Boolean(selections.partner?.licenseNr)} value={form.partnerLicenseNr} onChange={(partnerLicenseNr) => setForm({ ...form, partnerLicenseNr })} required={licenseRequired} />}
          </div>
          {showFeeSelect && <SelectField label={t('Startgeld Partner')} value={selectedFee('partner')} onChange={(tariffId) => setSelectedFee('partner', tariffId)} options={feeOptions('partner')} />}
        </RegistrationSection>
      )}
      {allowsPartner2 && (
        <RegistrationSection title={t('Spieler 3')}>
          <p className="hint">{t('Ein Triplette-Team kann auch zu zweit angemeldet und vor Ort vervollständigt werden.')}</p>
          {names('partner2')}
          <ParticipantQuestions participant="partner2" questions={registrationQuestions} answers={form.registrationAnswers || []} onChange={(questionId, checked) => setQuestionAnswer('partner2', questionId, checked)} />
          <TextField label={t('E-Mail')} type="email" readOnly={Boolean(selections.partner2)} value={form.partner2Email} onChange={(partner2Email) => setForm({ ...form, partner2Email })} />
          <div className="form-grid">
            <TextField label={t('Verein')} readOnly={Boolean(selections.partner2)} value={form.partner2Club} onChange={(partner2Club) => setForm({ ...form, partner2Club })} list={clubList} />
            {(licenseRequired || selections.partner2?.licenseNr) && <TextField label={t('Lizenznummer')} readOnly={Boolean(selections.partner2?.licenseNr)} value={form.partner2LicenseNr} onChange={(partner2LicenseNr) => setForm({ ...form, partner2LicenseNr })} required={licenseRequired} />}
          </div>
          {showFeeSelect && <SelectField label={t('Startgeld Partner 2')} value={selectedFee('partner2')} onChange={(tariffId) => setSelectedFee('partner2', tariffId)} options={feeOptions('partner2')} />}
        </RegistrationSection>
      )}
      {showStatus && (
        <RegistrationSection title={t('Organisation')}>
          <label className="checkbox-field">
            <input type="checkbox" disabled={Boolean(selections.primary)} checked={Boolean(form.noEmail)} onChange={(event) => setForm({ ...form, noEmail: event.target.checked })} />
            {t('Keine E-Mail-Adresse vorhanden')}
          </label>
          <div className="form-grid">
            <IntegerField label={t('Setzposition')} min={0} value={form.seedingPosition} onChange={(seedingPosition) => setForm({ ...form, seedingPosition })} />
            <SelectField label={t('Status')} value={form.status} onChange={(status) => setForm({ ...form, status })} options={translatedOptions(REGISTRATION_STATUSES.filter((option) => option.value !== 'rejected' || form.status === 'rejected'))} />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isVip}
              onChange={(event) => setForm({ ...form, isVip: event.target.checked })}
            />
            <span className="vip-badge">{t('VIP')}</span>
          </label>
        </RegistrationSection>
      )}
    </>
  );
}

export default RegistrationFields;
