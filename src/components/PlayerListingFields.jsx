import { useTranslation } from 'react-i18next';
import { TextField, SelectField } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';
import { RichTextEditor } from './RichTextEditor.jsx';

const TYPE_OPTIONS = [
  { value: 'tournament', label: 'Turnier' },
  { value: 'training', label: 'Training' },
];
const PLAYING_POSITION_OPTIONS = [
  { value: 'leger', label: 'Leger' },
  { value: 'milieu', label: 'Milieu' },
  { value: 'schiesser', label: 'Schießer' },
  { value: 'egal', label: 'Egal' },
];

export function PlayerListingFields({ form, setForm, language, venues = [] }) {
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
      <SelectField
        label={t('Ich bin')}
        value={form.playingPosition}
        onChange={(playingPosition) => setForm({ ...form, playingPosition })}
        options={PLAYING_POSITION_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
      />
      {venues.length > 0 && <SelectField
        label={t('Bouleplatz')}
        value={form.venueId || ''}
        onChange={(venueId) => {
          const venue = venues.find((entry) => entry.id === venueId);
          setForm({ ...form, venueId, locationName: venue ? venue.address : form.locationName, latitude: venue ? venue.latitude : form.latitude, longitude: venue ? venue.longitude : form.longitude, locationConfirmed: Boolean(venue) });
        }}
        options={[{ value: '', label: t('Individuellen Ort verwenden') }, ...venues.map((venue) => ({ value: venue.id, label: `${venue.clubName ? `${venue.clubName}: ` : ''}${venue.name} (${t(venue.venueType === 'indoor' ? 'Boulehalle' : 'Bouleplatz')})` }))]}
      />}
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
        disabled={Boolean(form.venueId)}
      />
      {form.type === 'tournament' && (
        <TextField label={t('Datum')} type="date" value={form.eventDate} onChange={(eventDate) => setForm({ ...form, eventDate })} required />
      )}
    </>
  );
}

export default PlayerListingFields;
