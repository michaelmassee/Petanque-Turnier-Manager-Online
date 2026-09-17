import { useTranslation } from 'react-i18next';
import { TextField } from './ui.jsx';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';
import { RichTextEditor } from './RichTextEditor.jsx';

export function BoulePlaceFields({ form, setForm, language, isClubPlayingArea = false }) {
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
      <TextField label={t('Ausstattung')} value={form.facilities} onChange={(facilities) => setForm({ ...form, facilities })} />
      <label className="checkbox-row">
        <input type="checkbox" checked={form.accessible} onChange={(event) => setForm({ ...form, accessible: event.target.checked })} />
        <span>{t('Barrierefrei')}</span>
      </label>
      {isClubPlayingArea && (
        <label className="checkbox-row">
          <input type="checkbox" checked={form.separateFromClub} onChange={(event) => setForm({ ...form, separateFromClub: event.target.checked })} />
          <span>{t('Spielfläche liegt räumlich getrennt vom Verein und auf der Karte anzeigen')}</span>
        </label>
      )}
    </>
  );
}

export default BoulePlaceFields;
