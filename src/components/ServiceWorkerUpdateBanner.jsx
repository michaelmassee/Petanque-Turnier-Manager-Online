import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui.jsx';
import { isServiceWorkerUpdateAvailable, subscribeServiceWorkerUpdate } from '../lib/service-worker-update.js';

export function ServiceWorkerUpdateBanner() {
  const { t } = useTranslation();
  const updateAvailable = useSyncExternalStore(subscribeServiceWorkerUpdate, isServiceWorkerUpdateAvailable);
  if (!updateAvailable) return null;

  return (
    <div className="service-worker-update" role="status">
      <span>{t('Neue Version verfügbar. Speichere offene Eingaben und lade dann neu.')}</span>
      <Button onClick={() => window.location.reload()}>{t('Neu laden')}</Button>
    </div>
  );
}
