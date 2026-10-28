import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, Feedback } from '../components/ui.jsx';
import { QUICK_START_TEMPLATES, quickStartPayload, quickStartTemplateLabel } from '../lib/quickstart-templates.js';

// Schnellstart: Vorlage wählen, das private Turnier wird angelegt und sofort gestartet. Danach geht es in
// „Turnier starten“ weiter (Spieler nachmelden, Runde auslosen).
export default function TournamentQuickStart({ currentUser, onStarted, onCreated }) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function handleStart(template) {
    setError('');
    setBusyId(template.id);
    let tournamentId = '';
    try {
      const payload = quickStartPayload(template, { currentUser, fallbackLocation: t('Schnellstart') });
      const { tournament } = await authenticatedApi('/api/tournaments', { method: 'POST', body: JSON.stringify(payload) });
      tournamentId = tournament.id;
      await authenticatedApi(`/api/tournaments/${tournamentId}/start`, { method: 'POST' });
      await onStarted?.(tournamentId);
    } catch (err) {
      if (tournamentId) {
        setError(`${t('Das Turnier wurde angelegt, konnte aber nicht gestartet werden. Du kannst es unter „Turnier starten“ starten.')} ${err.message}`);
        await onCreated?.();
      } else {
        setError(err.message);
      }
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="panel">
      <h2>{t('Schnellstart')}</h2>
      <p className="hint">{t('Vorlage wählen – das private Turnier wird sofort angelegt und gestartet. Danach meldest du die Spieler nach und lost die erste Runde aus.')}</p>
      <Feedback error={error} />
      <div className="quickstart-grid">
        {QUICK_START_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            variant="secondary"
            disabled={Boolean(busyId)}
            loading={busyId === template.id}
            onClick={() => handleStart(template)}
          >
            {quickStartTemplateLabel(template)}
          </Button>
        ))}
      </div>
    </div>
  );
}
