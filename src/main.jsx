import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppRecoveryBoundary } from './AppRecovery.jsx';
import { ServiceWorkerUpdateBanner } from './components/ServiceWorkerUpdateBanner.jsx';
import { OfflineNotice } from './components/layout.jsx';
import { applySeasonClass } from './lib/seasonal.js';
import { registerServiceWorker } from './lib/service-worker-update.js';
import { initDebugFromUrl, installDebugListeners } from './lib/debug-log.js';
import { DebugPanel } from './components/DebugPanel.jsx';
import './lib/i18next-config.js';
import './styles.css';
import 'leaflet/dist/leaflet.css';

applySeasonClass();
// Diagnose-Schalter (?debug=1) vor allem anderen auswerten, damit auch der Start protokolliert wird.
initDebugFromUrl();
installDebugListeners();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRecoveryBoundary>
      <OfflineNotice />
      <App />
      <ServiceWorkerUpdateBanner />
    </AppRecoveryBoundary>
    {/* Außerhalb der Fehlergrenze: die Diagnose bleibt auch sichtbar, wenn die App abstürzt. */}
    <DebugPanel />
  </StrictMode>,
);

registerServiceWorker();
