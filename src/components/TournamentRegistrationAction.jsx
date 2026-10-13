import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { hasOpenRegistration, registrationNotYetOpen } from '../lib/domain.js';
import { Button, Feedback } from './ui.jsx';

const openingRefreshTimes = new WeakMap();

export function TournamentRegistrationAction({ tournament, currentUser, onRegister }) {
  const { t } = useTranslation();
  if (tournament.registrationEnabled === false) return null;
  const upcoming = tournament.visibility === 'public' && tournament.status === 'registration'
    && !tournament.registrationClosed && registrationNotYetOpen(tournament);
  if (currentUser && upcoming) return <OpeningSubscriptionControl tournament={tournament} userId={currentUser.id} />;
  return <Button variant="secondary" onClick={() => onRegister(tournament)}
    disabled={tournament.visibility !== 'public' || !hasOpenRegistration(tournament)}>{t('Anmelden (Turnier)')}</Button>;
}

function OpeningSubscriptionControl({ tournament, userId }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ['registration-opening-subscriptions', userId];
  const subscriptions = useQuery({ queryKey: key, queryFn: () => authenticatedApi('/api/me/registration-opening-subscriptions'), staleTime: 60_000, refetchOnWindowFocus: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now);
  const opensAt = new Date(tournament.registrationOpensAt).getTime();
  const active = subscriptions.data?.tournamentIds.includes(tournament.id) || false;
  const waitingForRelease = !Number.isFinite(opensAt) || clock >= opensAt;
  const description = active ? t('openingNotificationActive') : waitingForRelease ? t('registrationOpeningInProgress') : t('openingNotificationSubscribe');
  useEffect(() => {
    if (!Number.isFinite(opensAt)) return;
    const remaining = opensAt - Date.now();
    if (remaining <= 0) return;
    // One refresh at the known date, no browser polling. Long dates are chunked
    // to respect the browser's signed 32-bit timeout limit.
    const timer = setTimeout(() => {
      setClock(Date.now());
      if (Date.now() >= opensAt && Date.now() - (openingRefreshTimes.get(client) || 0) > 1000) {
        openingRefreshTimes.set(client, Date.now());
        client.invalidateQueries({ queryKey: ['tournaments'] }, { cancelRefetch: false });
      }
    }, Math.min(remaining + 250, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [opensAt, client, clock]);

  async function toggle() {
    setSaving(true); setError('');
    try {
      const result = await authenticatedApi(`/api/tournaments/${encodeURIComponent(tournament.id)}/registration-opening-subscription`, { method: active ? 'DELETE' : 'PUT' });
      client.setQueryData(key, (previous) => ({ tournamentIds: result.active
        ? [...new Set([...(previous?.tournamentIds || []), tournament.id])]
        : (previous?.tournamentIds || []).filter((id) => id !== tournament.id) }));
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }

  return <div>
    <Button variant="secondary" onClick={toggle} loading={saving} aria-pressed={active}
      disabled={subscriptions.isLoading || Boolean(subscriptions.error) || (!active && waitingForRelease)}
      aria-label={description}
      title={active ? t('openingNotificationDeactivate') : description}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
        <path d="M10 21h4" />
      </svg>
      {active ? t('openingNotificationActiveShort') : waitingForRelease ? t('registrationOpeningInProgress') : t('openingNotificationSubscribeShort')}
    </Button>
    <Feedback error={error || subscriptions.error?.message} />
  </div>;
}
