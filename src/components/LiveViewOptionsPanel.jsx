import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { isDocumentBound } from '../lib/domain.js';
import { supportsPlayerResultReporting } from '../lib/result-reporting.js';
import { Button, Feedback } from './ui.jsx';

// Live-Ansicht und Ergebnismeldung durch Spieler in der Spielverwaltung. Bei Turnieren im Turnierdokument ist das
// Dokument Master (Desktop schickt beides per PUT /api/sync/…/settings): hier nur Anzeige. „Erst nach Bestätigung“
// wirkt nur bei Online-Durchführung; beim Dokument übernimmt oder verwirft die Turnierleitung im Desktop.
// onSaved(state): die Seite führt liveViewEnabled/playerResultReportingEnabled im Turnierobjekt nach.
export function LiveViewOptionsPanel({ tournament, onSaved }) {
  const { t } = useTranslation();
  const documentBound = isDocumentBound(tournament);
  const reportingSupported = supportsPlayerResultReporting(tournament.type);
  // Steht in tournament_options, nicht im Turnierobjekt: nachladen (nur bei Online-Durchführung gebraucht).
  const settingsQuery = useQuery({
    queryKey: ['tournament-settings', tournament.id],
    queryFn: () => authenticatedApi(`/api/tournaments/${tournament.id}/settings`),
    enabled: !documentBound,
  });
  const saved = {
    liveViewEnabled: Boolean(tournament.liveViewEnabled),
    playerResultReportingEnabled: Boolean(tournament.liveViewEnabled && tournament.playerResultReportingEnabled && reportingSupported),
    resultReportConfirmationRequired: Boolean(settingsQuery.data?.resultReportConfirmationRequired),
  };
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setDraft(JSON.parse(savedKey)), [savedKey, tournament.id]);
  useEffect(() => {
    setError('');
    setMessage('');
  }, [tournament.id]);

  const confirmationLoaded = documentBound || Boolean(settingsQuery.data);
  const payload = {
    liveViewEnabled: draft.liveViewEnabled,
    playerResultReportingEnabled: draft.liveViewEnabled && draft.playerResultReportingEnabled && reportingSupported,
    // Erst senden, wenn der gespeicherte Stand bekannt ist – sonst überschriebe ein zu frühes Speichern ihn.
    ...(!documentBound && confirmationLoaded ? {
      resultReportConfirmationRequired: draft.liveViewEnabled && draft.playerResultReportingEnabled && draft.resultReportConfirmationRequired,
    } : {}),
  };
  const baseline = {
    liveViewEnabled: saved.liveViewEnabled,
    playerResultReportingEnabled: saved.playerResultReportingEnabled,
    ...(!documentBound && confirmationLoaded ? {
      resultReportConfirmationRequired: saved.playerResultReportingEnabled && saved.resultReportConfirmationRequired,
    } : {}),
  };
  const changed = JSON.stringify(payload) !== JSON.stringify(baseline);
  const set = (key) => (event) => {
    const { checked } = event.target;
    setDraft((current) => ({ ...current, [key]: checked }));
  };

  async function save() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/options`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!documentBound) settingsQuery.refetch();
      onSaved?.({ liveViewEnabled: data.liveViewEnabled, playerResultReportingEnabled: data.playerResultReportingEnabled });
      setMessage(t('Einstellungen gespeichert.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel tournament-options">
      <summary>{t('Live-Ansicht und Ergebnismeldung')}</summary>
      <div className="form">
        <label className="checkbox-field">
          <input type="checkbox" checked={draft.liveViewEnabled} disabled={documentBound || busy || !confirmationLoaded} onChange={set('liveViewEnabled')} />
          <span>{t('Live-Ansicht freischalten')}</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={draft.liveViewEnabled && draft.playerResultReportingEnabled && reportingSupported}
            disabled={documentBound || busy || !confirmationLoaded || !draft.liveViewEnabled || !reportingSupported}
            onChange={set('playerResultReportingEnabled')}
          />
          <span>{t('Spieler dürfen Ergebnisse ihrer laufenden Partie in der Live-Ansicht melden')}</span>
        </label>
        {!documentBound && draft.liveViewEnabled && draft.playerResultReportingEnabled && reportingSupported && (
          <label className="checkbox-field checkbox-field-nested">
            <input
              type="checkbox"
              checked={draft.resultReportConfirmationRequired}
              disabled={busy || !confirmationLoaded}
              onChange={set('resultReportConfirmationRequired')}
            />
            <span>{t('Gemeldete Ergebnisse erst nach Bestätigung durch die Turnierleitung veröffentlichen')}</span>
          </label>
        )}
        {!draft.liveViewEnabled && <p className="hint">{t('Ergebnismeldungen durch Spieler sind nur mit freigeschalteter Live-Ansicht möglich.')}</p>}
        {draft.liveViewEnabled && !reportingSupported && <p className="hint">{t('Bei Trip-Tête melden Spieler keine Ergebnisse: Eine Begegnung besteht aus drei Partien, die die Turnierleitung einträgt.')}</p>}
        {documentBound && draft.liveViewEnabled && draft.playerResultReportingEnabled && reportingSupported && (
          <p className="hint">{t('Gemeldete Ergebnisse übernimmt oder verwirft die Turnierleitung im Turnierdokument.')}</p>
        )}
        {documentBound ? (
          <p className="hint">{t('Bei diesem Turnier stellt die Turnierleitung Live-Ansicht und Ergebnismeldung im Turnierdokument ein (PTM-Konfiguration).')}</p>
        ) : (
          <div className="row-actions">
            <Button disabled={busy || !changed} loading={busy} onClick={save}>{t('Speichern')}</Button>
          </div>
        )}
      </div>
      <Feedback error={error || settingsQuery.error?.message || ''} />
      <Feedback message={message} />
    </details>
  );
}
