import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { googleMapsCoordinates } from '../lib/google-maps-location.js';
import { Button, EditDialog, Feedback, TextField } from './ui.jsx';

function ImportDialog({ onClose, onImport }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const requestRef = useRef(null);
  const versionRef = useRef(0);
  const importRef = useRef(onImport);
  importRef.current = onImport;

  useEffect(() => {
    rootRef.current?.querySelector('input')?.focus();
    const viewport = window.visualViewport;
    function fitViewport() {
      const root = rootRef.current;
      if (!root || !viewport) return;
      root.style.setProperty('--import-viewport-height', `${viewport.height}px`);
      root.style.setProperty('--import-viewport-top', `${viewport.offsetTop}px`);
    }
    fitViewport();
    viewport?.addEventListener('resize', fitViewport);
    viewport?.addEventListener('scroll', fitViewport);
    return () => {
      versionRef.current += 1;
      requestRef.current?.abort();
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
    };
  }, []);

  async function importCoordinates() {
    if (!url.trim() || requestRef.current) return;
    const version = ++versionRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setError('');
    setLoading(true);
    try {
      const coordinates = googleMapsCoordinates(url) || await api('/api/locations/google-maps', {
        method: 'POST', body: JSON.stringify({ url }), signal: controller.signal,
      });
      if (version !== versionRef.current || controller.signal.aborted) return;
      importRef.current(coordinates);
      onClose();
    } catch (failure) {
      if (version === versionRef.current && !controller.signal.aborted) setError(t(failure.message));
    } finally {
      if (version === versionRef.current) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  function handleKeyDown(event) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const elements = [...rootRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return createPortal(<div className="google-maps-import-layer" ref={rootRef} onKeyDown={handleKeyDown} onClick={(event) => event.stopPropagation()}>
    <EditDialog compact nested title={t('Koordinaten aus Google Maps')} onClose={onClose} error={error}>
      <div className="form google-maps-import-form">
        <p className="hint">{t('In Google Maps einen Punkt markieren, den Link teilen und hier einfügen.')}</p>
        <TextField label={t('Google-Maps-Link')} value={url} inputMode="url" autoComplete="off" maxLength={8192}
          onChange={(next) => {
            versionRef.current += 1;
            requestRef.current?.abort();
            requestRef.current = null;
            setLoading(false);
            setError('');
            setUrl(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void importCoordinates(); }
          }}
        />
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onClose}>{t('Abbrechen')}</Button>
          <Button loading={loading} disabled={!url.trim()} onClick={importCoordinates}>{t('Übernehmen')}</Button>
        </div>
      </div>
    </EditDialog>
  </div>, document.body);
}

export function GoogleMapsImport({ location, onImport }) {
  const { t } = useTranslation();
  const [openFor, setOpenFor] = useState(null);
  const [importedFor, setImportedFor] = useState(null);
  const triggerRef = useRef(null);
  const open = openFor !== null && openFor === location;

  useEffect(() => { setOpenFor(null); setImportedFor(null); }, [location]);

  function close() {
    setOpenFor(null);
    triggerRef.current?.focus();
  }

  return <>
    <button ref={triggerRef} type="button" className="google-maps-import-trigger" aria-label={t('Koordinaten aus Google Maps importieren')}
      title={t('Koordinaten aus Google Maps importieren')} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setImportedFor(null); setOpenFor(location); }}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="m9 18-6 3V6l6-3 6 3 6-3v8M9 3v15m6-12v5m3 3v8m-3-3 3 3 3-3M9 18l3 1.5" />
      </svg>
    </button>
    {open && <ImportDialog onClose={close} onImport={(coordinates) => { onImport(coordinates); setImportedFor(location); }} />}
    {importedFor === location && <div className="google-maps-import-feedback"><Feedback message={t('Koordinaten übernommen.')} /></div>}
  </>;
}
