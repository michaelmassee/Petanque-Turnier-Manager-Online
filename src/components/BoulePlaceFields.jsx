import { useTranslation } from 'react-i18next';
import { TextField, TextArea } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';

export function BoulePlaceFields({ form, setForm, language }) {
  const { t } = useTranslation();
  return (
    <>
      <TextField label={t('Name')} value={form.name} onChange={(name) => setForm({ ...form, name })} required minLength={2} />
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
      <TextArea label={t('Beschreibung')} value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <TextField label={t('Ausstattung')} value={form.facilities} onChange={(facilities) => setForm({ ...form, facilities })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={form.accessible} onChange={(event) => setForm({ ...form, accessible: event.target.checked })} />
        <span>{t('Barrierefrei')}</span>
      </label>
    </>
  );
}

export default BoulePlaceFields;
