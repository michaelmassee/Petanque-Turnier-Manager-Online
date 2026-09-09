import { useEffect } from 'react';
import { REGISTRATION_STATUSES } from '../lib/constants.js';
import { SelectField, TextField } from './ui.jsx';

export function RegistrationFields({ form, setForm, showStatus, formation, registrationType, licenseRequired, teamNameEnabled, invalidField }) {
  const isDrawnTeam = registrationType === 'melee' || registrationType === 'supermelee';
  const allowsPartner = isDrawnTeam ? false : (formation ? formation !== 'tete' : true);
  const allowsPartner2 = isDrawnTeam ? false : formation === 'triplette';
  const showMeleeNotice = isDrawnTeam && formation && formation !== 'tete';

  useEffect(() => {
    if (!allowsPartner && (form.partnerFirstName || form.partnerLastName || form.partnerEmail || form.partnerLicenseNr || form.partner2FirstName || form.partner2LastName || form.partner2Email || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, partnerFirstName: '', partnerLastName: '', partnerEmail: '', partnerLicenseNr: '', partner2FirstName: '', partner2LastName: '', partner2Email: '', partner2LicenseNr: '' }));
    } else if (allowsPartner && !allowsPartner2 && (form.partner2FirstName || form.partner2LastName || form.partner2Email || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, partner2FirstName: '', partner2LastName: '', partner2Email: '', partner2LicenseNr: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowsPartner, allowsPartner2]);

  useEffect(() => {
    if (!licenseRequired && (form.licenseNr || form.partnerLicenseNr || form.partner2LicenseNr)) {
      setForm((current) => ({ ...current, licenseNr: '', partnerLicenseNr: '', partner2LicenseNr: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseRequired]);

  return (
    <>
      <div className="form-grid">
        <TextField label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} required minLength={2} invalid={invalidField === 'firstName'} />
        <TextField label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} required minLength={2} invalid={invalidField === 'firstName'} />
      </div>
      <TextField label="E-Mail" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
      <div className="form-grid">
        <TextField label="Verein" value={form.club} onChange={(club) => setForm({ ...form, club })} />
        {licenseRequired && (
          <TextField
            label="Lizenznummer"
            value={form.licenseNr}
            onChange={(licenseNr) => setForm({ ...form, licenseNr })}
            required
          />
        )}
      </div>
      {teamNameEnabled && <TextField label="Teamname" value={form.teamName} onChange={(teamName) => setForm({ ...form, teamName })} invalid={invalidField === 'teamName'} />}
      {showMeleeNotice && (
        <p className="muted">
          {registrationType === 'supermelee'
            ? 'Dieses Turnier wird als Supermêlée gespielt – die Teams werden vor jeder Runde neu ausgelost.'
            : 'Dieses Turnier wird als Mêlée gespielt – Partner werden vor Ort ausgelost.'}
        </p>
      )}
      {allowsPartner && (
        <>
          <div className="form-grid">
            <TextField label="Partner Vorname" value={form.partnerFirstName} onChange={(partnerFirstName) => setForm({ ...form, partnerFirstName })} required minLength={2} invalid={invalidField === 'partnerFirstName'} />
            <TextField label="Partner Nachname" value={form.partnerLastName} onChange={(partnerLastName) => setForm({ ...form, partnerLastName })} required minLength={2} invalid={invalidField === 'partnerFirstName'} />
          </div>
          <div className="form-grid">
            <TextField label="Partner E-Mail" type="email" value={form.partnerEmail} onChange={(partnerEmail) => setForm({ ...form, partnerEmail })} />
            {licenseRequired && (
              <TextField
                label="Partner Lizenznummer"
                value={form.partnerLicenseNr}
                onChange={(partnerLicenseNr) => setForm({ ...form, partnerLicenseNr })}
                required
              />
            )}
          </div>
        </>
      )}
      {allowsPartner2 && (
        <>
          <div className="form-grid">
            <TextField label="Partner 2 Vorname" value={form.partner2FirstName} onChange={(partner2FirstName) => setForm({ ...form, partner2FirstName })} required minLength={2} invalid={invalidField === 'partner2FirstName'} />
            <TextField label="Partner 2 Nachname" value={form.partner2LastName} onChange={(partner2LastName) => setForm({ ...form, partner2LastName })} required minLength={2} invalid={invalidField === 'partner2FirstName'} />
          </div>
          <div className="form-grid">
            <TextField label="Partner 2 E-Mail" type="email" value={form.partner2Email} onChange={(partner2Email) => setForm({ ...form, partner2Email })} />
            {licenseRequired && (
              <TextField
                label="Partner 2 Lizenznummer"
                value={form.partner2LicenseNr}
                onChange={(partner2LicenseNr) => setForm({ ...form, partner2LicenseNr })}
                required
              />
            )}
          </div>
        </>
      )}
      {showStatus && (
        <>
          <div className="form-grid">
            <TextField label="Setzposition" type="number" min="0" value={form.seedingPosition} onChange={(seedingPosition) => setForm({ ...form, seedingPosition })} />
            <SelectField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={REGISTRATION_STATUSES} />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.isVip}
              onChange={(event) => setForm({ ...form, isVip: event.target.checked })}
            />
            VIP
          </label>
        </>
      )}
    </>
  );
}

export default RegistrationFields;
