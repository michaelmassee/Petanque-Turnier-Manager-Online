import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tournamentImageUrl } from '../lib/domain.js';
import { DEFAULT_FLYER_CONFIG, FLYER_TEMPLATES, FLYER_VISIBLE_FIELDS, sanitizeFlyerConfig } from '../lib/flyer-config.js';
import { FLYER_FONT_URLS } from '../lib/flyer-font-urls.js';
import { createFlyerFontLoader } from '../lib/flyer-fonts.js';
import { renderFlyerPdf, renderFlyerSvg } from '../lib/flyer-render.js';
import { buildFlyerScene, flyerFileName, flyerSceneText } from '../lib/flyer-scene.js';
import { loadFlyerLocalDesign, removeFlyerBackground, saveFlyerBackground, saveFlyerBackgroundPanelTransparency, saveFlyerLocalConfig, setFlyerBackgroundActive } from '../lib/flyer-background-storage.js';
import { DEFAULT_QR_DESIGN, sanitizeQrDesign } from '../lib/qr-design.js';
import { loadQrLogo, toQrOptions } from '../lib/qr-style.js';
import { RichTextEditor } from './RichTextEditor.jsx';
import { Button, EditDialog, Feedback, SelectField, TextField } from './ui.jsx';

const TEMPLATE_LABELS = { modern: 'Modern', sporty: 'Sportlich', classic: 'Klassisch', background: 'Eigenes Hintergrundbild' };
const FIELD_LABELS = { date: 'Datum', location: 'Ort', formation: 'Turnier', fees: 'Startgeld', capacity: 'Kapazität', deadline: 'Anmeldeschluss', status: 'Status', description: 'Beschreibung' };
const PNG_DPI = 150;
const LOGO_MAX_PIXELS = 1200;
// Kantenlänge des QR-Bildes: auf rund 40 mm Druckbreite gut 750 dpi.
const QR_PIXELS = 1200;
const BACKGROUND_MAX_BYTES = 15 * 1024 * 1024;
const BACKGROUND_MAX_PIXELS = 3000;
const IMAGE_ACCEPT = ['image', String.fromCharCode(42)].join('/');

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

function blobFromCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas'))), type, quality));
}

/** Normalisiert lokale Fotos für die Vorschau und den PDF-Export, ohne je ein Netzwerk zu berühren. */
async function prepareBackground(blob) {
  const type = String(blob?.type || '').toLowerCase();
  const nameLooksLikeImage = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(String(blob?.name || ''));
  if (!blob || blob.size > BACKGROUND_MAX_BYTES || (!type.startsWith('image/') && !nameLooksLikeImage)) throw new Error('invalid-background');
  // `img-src` erlaubt bewusst data:, aber nicht blob:. Daher muss auch die lokale Quelldatei vor dem Laden
  // in eine Data-URL umgewandelt werden – alle vom jeweiligen Browser dekodierbaren Bildformate funktionieren so.
  const image = await loadImage(await blobToDataUrl(blob));
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('invalid-background');
  const scale = Math.min(1, BACKGROUND_MAX_PIXELS / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const normalized = await blobFromCanvas(canvas, 'image/jpeg', 0.9);
  const dataUrl = await blobToDataUrl(normalized);
  return { blob: normalized, dataUrl, bytes: dataUrlToBytes(dataUrl), width: canvas.width, height: canvas.height, type: normalized.type };
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

/**
 * Derselbe QR-Code wie im QR-Dialog: gespeichertes Design des Turniers, immer mit PTM-Logo.
 * Als PNG-Data-URL, damit SVG (als <img>) und PDF ihn ohne Nachladen einbetten können.
 */
async function createQrImage(design, url) {
  const QRCodeStyling = (await import('qr-code-styling')).default;
  const logoUrl = await loadQrLogo(design);
  const blob = await new QRCodeStyling(toQrOptions(design, url, { logoUrl, size: QR_PIXELS })).getRawData('png');
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, png: dataUrlToBytes(dataUrl), background: design.bgColor };
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
export function TournamentFlyerDialog({ tournament, qrUrl, qrDesign, currentUserId, onClose }) {
  const { t, i18n } = useTranslation();
  const [config, setConfig] = useState(DEFAULT_FLYER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [fontSet, setFontSet] = useState(null);
  const [qr, setQr] = useState(null);
  const [logo, setLogo] = useState(null);
  const [background, setBackground] = useState(null);
  const [backgroundActive, setBackgroundActive] = useState(false);
  const [backgroundPanelTransparency, setBackgroundPanelTransparency] = useState(50);
  const [backgroundNotice, setBackgroundNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadFlyerLocalDesign(currentUserId, tournament.id)
      .then(async (record) => {
        if (cancelled) return;
        setConfig(sanitizeFlyerConfig(record?.config || DEFAULT_FLYER_CONFIG));
        if (Number.isFinite(record?.backgroundPanelTransparency)) setBackgroundPanelTransparency(Math.min(100, Math.max(0, record.backgroundPanelTransparency)));
        if (!record?.blob) return;
        const next = await prepareBackground(record.blob);
        if (!cancelled) {
          setBackground(next);
          setBackgroundActive(record.active !== false);
        }
      })
      .catch(() => !cancelled && setBackgroundNotice(t('Die Flyer-Einstellungen konnten nicht lokal geladen werden.')))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [currentUserId, tournament.id, t]);

  useEffect(() => {
    let cancelled = false;
    createQrImage(sanitizeQrDesign(qrDesign ?? DEFAULT_QR_DESIGN), qrUrl)
      .then((value) => !cancelled && setQr(value))
      .catch(() => !cancelled && setError(t('QR-Code konnte nicht erzeugt werden')));
    return () => { cancelled = true; };
  }, [qrUrl, qrDesign, t]);

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
  const selectedTemplate = backgroundActive ? 'background' : config.templateId;
  const draftScene = useMemo(() => buildFlyerScene(tournament, config, i18n.language, t, { background: backgroundActive ? background : null, backgroundPanelTransparency }), [tournament, config, i18n.language, t, background, backgroundActive, backgroundPanelTransparency]);
  const sceneText = flyerSceneText(draftScene);
  useEffect(() => {
    let cancelled = false;
    ensureFlyerFonts(sceneText)
      .then((next) => !cancelled && setFontSet((current) => (current?.entries.length === next.entries.length ? current : next)))
      .catch(() => !cancelled && setError(t('Flyer konnte nicht erzeugt werden')));
    return () => { cancelled = true; };
  }, [sceneText, t]);

  const scene = useMemo(
    () => (fontSet ? buildFlyerScene(tournament, config, i18n.language, t, { measure: fontSet.measure, logo, background: backgroundActive ? background : null, backgroundPanelTransparency }) : null),
    [tournament, config, i18n.language, t, fontSet, logo, background, backgroundActive, backgroundPanelTransparency],
  );
  const previewUrl = useMemo(
    () => (scene && qr ? svgDataUrl(renderFlyerSvg(scene, { fontSet, qr, logo, background: backgroundActive ? background : null })) : ''),
    [scene, fontSet, qr, logo, background, backgroundActive],
  );
  const update = (changes) => setConfig((current) => {
    const next = sanitizeFlyerConfig({ ...current, ...changes });
    saveFlyerLocalConfig(currentUserId, tournament.id, next)
      .catch(() => setBackgroundNotice(t('Die Flyer-Einstellungen konnten nicht lokal gespeichert werden.')));
    return next;
  });

  function updateBackgroundPanelTransparency(value) {
    const next = Math.min(100, Math.max(0, Number(value) || 0));
    setBackgroundPanelTransparency(next);
    saveFlyerBackgroundPanelTransparency(currentUserId, tournament.id, next)
      .catch(() => setBackgroundNotice(t('Die Flyer-Einstellungen konnten nicht lokal gespeichert werden.')));
  }

  async function chooseBackground(file) {
    if (!file) return;
    setError('');
    setBackgroundNotice('');
    try {
      const next = await prepareBackground(file);
      setBackground(next);
      setBackgroundActive(true);
      try {
        await saveFlyerBackground(currentUserId, tournament.id, next.blob, true);
      } catch {
        setBackgroundNotice(t('Das Hintergrundbild konnte nicht lokal gespeichert werden. Es bleibt nur geöffnet, solange dieser Dialog offen ist.'));
      }
    } catch {
      setError(t('Bitte wähle ein Bild bis 15 MB aus. Unterstützt werden alle Bildformate, die dein Browser verarbeiten kann.'));
    }
  }

  async function selectTemplate(templateId) {
    if (templateId === 'background') {
      if (!background) {
        setBackgroundNotice(t('Wähle zuerst ein Hintergrundbild aus.'));
        return;
      }
      setBackgroundActive(true);
      try { await setFlyerBackgroundActive(currentUserId, tournament.id, true); } catch { setBackgroundNotice(t('Das Hintergrundbild konnte nicht lokal gespeichert werden. Es bleibt nur geöffnet, solange dieser Dialog offen ist.')); }
      return;
    }
    setBackgroundActive(false);
    update({ templateId });
    try { await setFlyerBackgroundActive(currentUserId, tournament.id, false); } catch { /* Das Bild bleibt in dieser Sitzung dennoch deaktiviert. */ }
  }

  async function clearBackground() {
    setBackground(null);
    setBackgroundActive(false);
    setBackgroundNotice('');
    try { await removeFlyerBackground(currentUserId, tournament.id); } catch { setBackgroundNotice(t('Das Hintergrundbild konnte nicht lokal entfernt werden.')); }
  }

  async function download(kind) {
    if (!previewUrl || scene.overflow) return;
    setExporting(kind);
    setError('');
    try {
      const blob = kind === 'pdf'
        ? new Blob([await renderFlyerPdf(scene, { fontSet, qr, logo, background: backgroundActive ? background : null, title: tournament.name })], { type: 'application/pdf' })
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
    <EditDialog wide title={t('Flyer erstellen')} subtitle={tournament.name} error={error} onClose={onClose}>
      {loading ? <p className="muted">{t('Lädt …')}</p> : (
        <div className="flyer-editor">
          <div className="flyer-settings">
            <SelectField
              label={t('Vorlage')}
              value={selectedTemplate}
              onChange={selectTemplate}
              options={[...FLYER_TEMPLATES, 'background'].map((value) => ({ value, label: t(TEMPLATE_LABELS[value]) }))}
            />
            <label className="flyer-background-picker">
              {t('Eigenes Hintergrundbild')}
              <input type="file" accept={IMAGE_ACCEPT} onChange={(event) => chooseBackground(event.target.files?.[0])} />
            </label>
            {background && <div className="dialog-actions flyer-background-actions"><Button variant="secondary" type="button" onClick={clearBackground}>{t('Hintergrundbild entfernen')}</Button></div>}
            {backgroundActive && <label className="flyer-background-transparency">
              {t('Transparenz der Textbox')}
              <span><input type="range" min="0" max="100" value={backgroundPanelTransparency} onChange={(event) => updateBackgroundPanelTransparency(event.target.value)} /> <output>{backgroundPanelTransparency}%</output></span>
            </label>}
            <small className="muted">{t('Alle Flyer-Einstellungen und dieses Hintergrundbild werden nur auf diesem Gerät gespeichert und nie hochgeladen.')}</small>
            {backgroundNotice && <small className="muted">{backgroundNotice}</small>}
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
            <RichTextEditor
              label={t('Zusatztext')}
              value={config.additionalText}
              onChange={(additionalText) => update({ additionalText })}
              boldLabel={t('Fett')}
              italicLabel={t('Kursiv')}
              underlineLabel={t('Unterstrichen')}
              strikeLabel={t('Durchgestrichen')}
              bulletListLabel={t('Aufzählung')}
              orderedListLabel={t('Nummerierte Liste')}
              headingLabel={t('Überschrift')}
            />
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
