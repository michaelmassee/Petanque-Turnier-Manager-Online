import { useTranslation } from 'react-i18next';
import { LocationAutocomplete } from './LocationAutocomplete.jsx';
import { TextField } from './ui.jsx';
import { GoogleMapsImport } from './GoogleMapsImport.jsx';

export function BoulePlaceLocationFields({ form, setForm }) {
  const { t } = useTranslation();
  return <>
    <LocationAutocomplete
      label={t('Adresse')}
      value={form.address}
      onChange={(address) => setForm({ ...form, address, ...(form.overrideCoordinates ? {} : { latitude: null, longitude: null }), locationConfirmed: false })}
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
    />
    <div className="coordinate-actions">
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(form.overrideCoordinates)}
          onChange={(event) => setForm({ ...form, overrideCoordinates: event.target.checked })}
        />
        {t('Koordinaten manuell anpassen')}
      </label>
      <GoogleMapsImport location={form.address} onImport={(coordinates) => setForm({ ...form, ...coordinates, overrideCoordinates: true })} />
    </div>
    {form.overrideCoordinates && <div className="form-grid">
      <TextField
        label={t('Breitengrad')}
        type="number"
        inputMode="decimal"
        step="any"
        min={-90}
        max={90}
        required
        value={form.latitude ?? ''}
        onChange={(latitude) => setForm({ ...form, latitude })}
      />
      <TextField
        label={t('Längengrad')}
        type="number"
        inputMode="decimal"
        step="any"
        min={-180}
        max={180}
        required
        value={form.longitude ?? ''}
        onChange={(longitude) => setForm({ ...form, longitude })}
      />
    </div>}
  </>;
}
