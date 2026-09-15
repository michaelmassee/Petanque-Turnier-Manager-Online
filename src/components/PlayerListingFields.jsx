import { useTranslation } from 'react-i18next';
import { TextField, TextArea, SelectField } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';

const TYPE_OPTIONS = [
  { value: 'tournament', label: 'Turnier' },
  { value: 'training', label: 'Training' },
];

export function PlayerListingFields({ form, setForm, language }) {
  const { t } = useTranslation();
  return (
    <>
      <SelectField
        label={t('Typ')}
        value={form.type}
        onChange={(type) => setForm({ ...form, type, eventDate: type === 'training' ? '' : form.eventDate })}
        options={TYPE_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
      />
      <TextField label={t('Titel')} value={form.title} onChange={(title) => setForm({ ...form, title })} required minLength={2} />
      <TextArea label={t('Beschreibung')} value={form.description} onChange={(description) => setForm({ ...form, description })} />
      <LocationAutocomplete
        label={t('Ort')}
        value={form.locationName}
        onChange={(locationName) => setForm({ ...form, locationName, locationConfirmed: false })}
        onSelect={(candidate) => setForm({
          ...form,
          locationName: candidate.displayName,
          latitude: candidate.lat,
          longitude: candidate.lng,
          locationConfirmed: true,
        })}
        confirmed={form.locationConfirmed}
        required
        minLength={2}
        language={language}
      />
      {form.type === 'tournament' && (
        <TextField label={t('Datum')} type="date" value={form.eventDate} onChange={(eventDate) => setForm({ ...form, eventDate })} required />
      )}
    </>
  );
}

export default PlayerListingFields;
