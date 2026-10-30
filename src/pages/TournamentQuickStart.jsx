import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, Feedback } from '../components/ui.jsx';
import { DEFAULT_TOURNAMENT_LIMIT, FORMATIONS, TOURNAMENT_STATUSES } from '../lib/constants.js';
import { labelFor } from '../lib/domain.js';
import { InfiniteListLoadMore, useInfiniteList } from '../components/InfiniteListLoadMore.jsx';
import { QUICK_START_FORMATIONS, quickStartPayload, quickStartSystemLabel, quickStartTemplates } from '../lib/quickstart-templates.js';

// Am Handy bricht „2026-10-29“ bzw. „10/29/2026“ sonst am Bindestrich/Schrägstrich um; das Datum am Namensende
// bleibt zusammen.
function nameWithUnbrokenDate(name) {
  const match = /^(.+) (\d[\d./-]{4,10}\d)$/.exec(name || '');
  if (!match) return name;
  return <>{match[1]} <span className="nowrap">{match[2]}</span></>;
}

// Schnellstart: Formation und System wählen, das private Turnier wird angelegt und sofort gestartet. Danach geht es in
// „Turnier starten“ weiter (Spieler nachmelden, Runde auslosen).
export default function TournamentQuickStart({ currentUser, tournaments = [], onStarted, onCreated, onOpen }) {
  const { t, i18n } = useTranslation();
  const [formation, setFormation] = useState('doublette');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const tournamentLimit = currentUser?.tournamentLimit ?? DEFAULT_TOURNAMENT_LIMIT;
  const ownedTournamentCount = tournaments.filter((tournament) => tournament.ownerId === currentUser?.id && tournament.registrationEnabled !== false).length;
  const limitReached = currentUser?.role !== 'admin' && ownedTournamentCount >= tournamentLimit;
  const disabled = Boolean(busyId) || limitReached;
  // Eigene Schnellstart-Turniere, neueste zuerst; ein Klick führt wie nach dem Anlegen in „Turnier starten“.
  const quickStartTournaments = tournaments
    .filter((tournament) => tournament.quickStart && tournament.ownerId === currentUser?.id)
    .sort((left, right) => (right.date || '').localeCompare(left.date || '') || (right.createdAt || '').localeCompare(left.createdAt || ''));
  const visibleQuickStarts = useInfiniteList(quickStartTournaments);

  async function handleStart(template) {
    if (disabled) return;
    setError('');
    setBusyId(template.id);
    let tournamentId = '';
    try {
      const payload = quickStartPayload(template, { currentUser, fallbackLocation: t('Schnellstart'), language: i18n.language });
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
      <p className="hint">{t('Formation und System wählen – das private Turnier wird sofort angelegt und gestartet. Danach meldest du die Spieler nach und lost die erste Runde aus.')}</p>
      {currentUser?.role !== 'admin' && <p className="hint">{t('Turnier-Limit:')} {ownedTournamentCount} / {tournamentLimit}</p>}
      <Feedback error={limitReached ? t('Turnier-Limit erreicht. Lösche alte Turniere oder kontaktiere einen Admin für mehr Turniere.') : ''} />
      <Feedback error={error} />
      <fieldset className="quickstart-formations">
        <legend>{t('Formation')}</legend>
        {QUICK_START_FORMATIONS.map((value) => (
          <label key={value} className={formation === value ? 'active' : ''}>
            <input type="radio" name="quickstart-formation" value={value} checked={formation === value} disabled={disabled} onChange={() => setFormation(value)} />
            {labelFor(FORMATIONS, value)}
          </label>
        ))}
      </fieldset>
      <div className="quickstart-grid" role="group" aria-label={t('Turniersystem')}>
        {quickStartTemplates(formation).map((template) => (
          <Button
            key={template.id}
            variant="secondary"
            disabled={disabled}
            loading={busyId === template.id}
            onClick={() => handleStart(template)}
          >
            {quickStartSystemLabel(template)}
          </Button>
        ))}
      </div>
      {quickStartTournaments.length > 0 && (
        <section className="quickstart-history" aria-label={t('Meine Schnellstart-Turniere')}>
          <h3>{t('Meine Schnellstart-Turniere')}</h3>
          <ul>
            {visibleQuickStarts.items.map((tournament) => (
              <li key={tournament.id}>
                <button type="button" className="quickstart-history-entry" onClick={() => onOpen?.(tournament.id)}>
                  <span className="quickstart-history-name" data-i18n-skip>{nameWithUnbrokenDate(tournament.name)}</span>
                  <span className={`status status-${tournament.status}`}>{labelFor(TOURNAMENT_STATUSES, tournament.status)}</span>
                </button>
              </li>
            ))}
          </ul>
          <InfiniteListLoadMore hasMore={visibleQuickStarts.hasMore} onLoadMore={visibleQuickStarts.loadMore} label={t('Weitere Einträge laden')} />
        </section>
      )}
    </div>
  );
}
