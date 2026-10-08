import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { tournamentImageUrl } from '../lib/domain.js';
import { DEFAULT_FLYER_CONFIG, FLYER_TEMPLATES, FLYER_VISIBLE_FIELDS, sanitizeFlyerConfig } from '../lib/flyer-config.js';
import { FLYER_FONT_URLS } from '../lib/flyer-font-urls.js';
import { createFlyerFontLoader } from '../lib/flyer-fonts.js';
import { renderFlyerPdf, renderFlyerSvg } from '../lib/flyer-render.js';
import { buildFlyerScene, flyerFileName, flyerSceneText } from '../lib/flyer-scene.js';
import { Button, EditDialog, Feedback, SelectField, TextArea, TextField } from './ui.jsx';

const TEMPLATE_LABELS = { modern: 'Modern', sporty: 'Sportlich', classic: 'Klassisch' };
const FIELD_LABELS = { date: 'Datum', location: 'Ort', formation: 'Turnier', fees: 'Startgeld', capacity: 'Kapazität', deadline: 'Anmeldeschluss', status: 'Status' };
const PNG_DPI = 150;
const LOGO_MAX_PIXELS = 1200;

// Modulweit, damit bereits geladene Teilschriften beim nächsten Öffnen nicht erneut geladen werden.
const ensureFlyerFonts = createFlyerFontLoader(async (subset, weight) => {
  const response = await fetch(FLYER_FONT_URLS[`${subset}-${weight}`]);
  if (!response.ok) throw new Error(`font ${subset}-${weight}: ${response.status}`);
  return response.arrayBuffer();
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Lädt das Logo über den Bild-Proxy und normalisiert es zu PNG: Das SVG braucht eine Data-URL
 * (als <img> lädt es keine externen Bilder), das PDF kann nur PNG/JPEG einbetten.
 */
async function loadLogo(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`logo: ${response.status}`);
  const image = await loadImage(await blobToDataUrl(await response.blob()));
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const scale = Math.min(1, LOGO_MAX_PIXELS / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  return { width: image.naturalWidth, height: image.naturalHeight, dataUrl, png: dataUrlToBytes(dataUrl) };
}

// Data-URL statt blob:, weil die CSP für Bilder nur 'self' und data: erlaubt.
function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function svgToPng(svgUrl, page) {
  const pixelsPerMm = PNG_DPI / 25.4;
  const image = await loadImage(svgUrl);
  await image.decode?.();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.width * pixelsPerMm);
  canvas.height = Math.round(page.height * pixelsPerMm);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'));
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Flyer-Editor: Gespeichert wird nur die Gestaltung, PNG/PDF entstehen lokal und werden nur heruntergeladen. */
export function TournamentFlyerDialog({ tournament, qrUrl, onClose }) {
  const { t, i18n } = useTranslation();
  const [config, setConfig] = useState(DEFAULT_FLYER_CONFIG);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fontSet, setFontSet] = useState(null);
  const [qrModules, setQrModules] = useState(null);
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authenticatedApi(`/api/tournaments/${tournament.id}/flyer-config`)
      .then((data) => {
        if (cancelled) return;
        setConfig(sanitizeFlyerConfig(data.config || DEFAULT_FLYER_CONFIG));
        setRevision(data.revision);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [tournament.id]);

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((module) => !cancelled && setQrModules(module.default.create(qrUrl, { errorCorrectionLevel: 'M' }).modules))
      .catch(() => !cancelled && setError(t('QR-Code konnte nicht erzeugt werden')));
    return () => { cancelled = true; };
  }, [qrUrl, t]);

  useEffect(() => {
    if (!tournament.logoUrl) return undefined;
    let cancelled = false;
    // Ohne erreichbares Logo bleibt der Flyer einfach ohne Logo.
    loadLogo(tournamentImageUrl(tournament.id, 'logo'))
      .then((value) => !cancelled && setLogo(value))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tournament.id, tournament.logoUrl]);

  // Erst grob setzen, um die benötigten Zeichen zu kennen, dann passende Teilschriften nachladen.
  const draftScene = useMemo(() => buildFlyerScene(tournament, config, i18n.language, t), [tournament, config, i18n.language, t]);
  const sceneText = flyerSceneText(draftScene);
  useEffect(() => {
    let cancelled = false;
    ensureFlyerFonts(sceneText)
      .then((next) => !cancelled && setFontSet((current) => (current?.entries.length === next.entries.length ? current : next)))
      .catch(() => !cancelled && setError(t('Flyer konnte nicht erzeugt werden')));
    return () => { cancelled = true; };
  }, [sceneText, t]);

  const scene = useMemo(
    () => (fontSet ? buildFlyerScene(tournament, config, i18n.language, t, { measure: fontSet.measure, logo }) : null),
    [tournament, config, i18n.language, t, fontSet, logo],
  );
  const previewUrl = useMemo(
    () => (scene && qrModules ? svgDataUrl(renderFlyerSvg(scene, { fontSet, qrModules, logo })) : ''),
    [scene, fontSet, qrModules, logo],
  );
  const update = (changes) => setConfig((current) => ({ ...current, ...changes }));

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/flyer-config`, {
        method: 'PUT',
        body: JSON.stringify({ config, expectedRevision: revision }),
      });
      setConfig(sanitizeFlyerConfig(data.config));
      setRevision(data.revision);
      setMessage(t('Flyer-Design gespeichert'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function download(kind) {
    if (!previewUrl || scene.overflow) return;
    setExporting(kind);
    setError('');
    setMessage('');
    try {
      const blob = kind === 'pdf'
        ? new Blob([await renderFlyerPdf(scene, { fontSet, qrModules, logo, title: tournament.name })], { type: 'application/pdf' })
        : await svgToPng(previewUrl, scene.page);
      saveBlob(blob, flyerFileName(tournament, scene.design.format, kind));
    } catch {
      setError(t('Flyer konnte nicht erzeugt werden'));
    } finally {
      setExporting('');
    }
  }

  const ready = Boolean(previewUrl);
  return (
    <EditDialog wide title={t('Flyer erstellen')} subtitle={tournament.name} message={message} error={error} onClose={onClose}>
      {loading ? <p className="muted">{t('Lädt …')}</p> : (
        <div className="flyer-editor">
          <div className="flyer-settings">
            <SelectField
              label={t('Vorlage')}
              value={config.templateId}
              onChange={(templateId) => update({ templateId })}
              options={FLYER_TEMPLATES.map((value) => ({ value, label: t(TEMPLATE_LABELS[value]) }))}
            />
            <SelectField
              label={t('Format')}
              value={config.format}
              onChange={(format) => update({ format })}
              options={[{ value: 'a4', label: 'A4' }, { value: 'a5', label: 'A5' }]}
            />
            <label>
              {t('Akzentfarbe')}
              <input type="color" value={config.accentColor} onChange={(event) => update({ accentColor: event.target.value })} />
            </label>
            <TextField label={t('Überschrift')} value={config.headline} maxLength={80} onChange={(headline) => update({ headline })} />
            <TextField label={t('Untertitel')} value={config.subtitle} maxLength={120} onChange={(subtitle) => update({ subtitle })} />
            <TextArea label={t('Zusatztext')} value={config.additionalText} maxLength={600} onChange={(additionalText) => update({ additionalText })} />
            <fieldset>
              <legend>{t('Angaben anzeigen')}</legend>
              {FLYER_VISIBLE_FIELDS.map((field) => (
                <label className="checkbox-field" key={field}>
                  <input
                    type="checkbox"
                    checked={config.visibleFields.includes(field)}
                    onChange={(event) => update({
                      visibleFields: event.target.checked
                        ? [...config.visibleFields, field]
                        : config.visibleFields.filter((item) => item !== field),
                    })}
                  />
                  {t(FIELD_LABELS[field])}
                </label>
              ))}
            </fieldset>
            <Button loading={saving} onClick={save}>{t('Design speichern')}</Button>
          </div>
          <div className="flyer-preview">
            {scene?.overflow && <Feedback error={t('Der Text passt nicht in das gewählte Flyerformat. Bitte kürze Überschrift, Untertitel oder Zusatztext.')} />}
            {ready
              ? <div className="flyer-preview-page"><img src={previewUrl} alt={t('Flyer-Vorschau')} /></div>
              : <p className="muted">{t('Lädt …')}</p>}
            <div className="dialog-actions">
              <Button variant="secondary" disabled={!ready || scene.overflow} loading={exporting === 'png'} onClick={() => download('png')}>{t('PNG herunterladen')}</Button>
              <Button variant="secondary" disabled={!ready || scene.overflow} loading={exporting === 'pdf'} onClick={() => download('pdf')}>{t('PDF herunterladen')}</Button>
            </div>
          </div>
        </div>
      )}
    </EditDialog>
  );
}
