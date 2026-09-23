import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppRecoveryBoundary } from './AppRecovery.jsx';
import { ServiceWorkerUpdateBanner } from './components/ServiceWorkerUpdateBanner.jsx';
import { markServiceWorkerUpdateAvailable } from './lib/service-worker-update.js';
import './lib/i18next-config.js';
import './styles.css';
import 'leaflet/dist/leaflet.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRecoveryBoundary>
      <App />
      <ServiceWorkerUpdateBanner />
    </AppRecoveryBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  // Ohne bisherigen Controller ist es die Erstinstallation: die Seite ist bereits
  // aktuell. Sonst nicht selbst neu laden (ungespeicherte Eingaben gingen verloren),
  // sondern einen Hinweis zeigen und den Zeitpunkt dem Nutzer überlassen.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) markServiceWorkerUpdateAvailable();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => registration.update())
      .catch((error) => console.error('Service worker registration failed', error));
  });
}
