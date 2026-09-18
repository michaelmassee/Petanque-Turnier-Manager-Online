import { useTranslation } from 'react-i18next';
import { TextField, SelectField } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';
import { RichTextEditor } from './RichTextEditor.jsx';

export function BoulePlaceFields({ form, setForm, language }) {
  const { t } = useTranslation();
  const facilityOptions = [
    ['toilet', 'Toilette'], ['shelter', 'Unterstand'], ['clubhouse', 'Vereinsheim'], ['lighting', 'Beleuchtung'],
    ['parking', 'Parkplatz'], ['catering', 'Gastronomie'], ['drinking_water', 'Trinkwasser'], ['accessible', 'Barrierefrei'],
  ];
  const codes = form.facilityCodes || [];
  const toggleFacility = (code) => setForm({ ...form, facilityCodes: codes.includes(code) ? codes.filter((entry) => entry !== code) : [...codes, code] });
  return (
    <>
      <TextField label={t('Name')} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
      <SelectField label={t('Spielorttyp')} value={form.venueType || 'outdoor'} onChange={(venueType) => setForm({ ...form, venueType })} options={[{ value: 'outdoor', label: t('Bouleplatz') }, { value: 'indoor', label: t('Boulehalle') }]} />
      <LocationAutocomplete
        label={t('Adresse')}
        value={form.address}
        onChange={(address) => setForm({ ...form, address, locationConfirmed: false })}
        onSelect={(candidate) => setForm({
          ...form,
          address: candidate.displayName,
          latitude: candidate.lat,
          longitude: candidate.lng,
          locationConfirmed: true,
        })}
        confirmed={form.locationConfirmed}
        required
        minLength={5}
        language={language}
      />
      <TextField label={t('Platzanzahl')} type="number" min={0} value={form.courtCount} onChange={(courtCount) => setForm({ ...form, courtCount })} />
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
      <fieldset className="checkbox-group">
        <legend>{t('Ausstattung')}</legend>
        {facilityOptions.map(([code, label]) => <label className="checkbox-row" key={code}>
          <input type="checkbox" checked={codes.includes(code)} onChange={() => toggleFacility(code)} />
          <span>{t(label)}</span>
        </label>)}
      </fieldset>
      <TextField label={t('Weitere Ausstattung/Hinweise')} value={form.facilities} onChange={(facilities) => setForm({ ...form, facilities })} />
    </>
  );
}

export default BoulePlaceFields;
