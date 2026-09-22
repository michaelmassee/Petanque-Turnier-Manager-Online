import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Feedback } from '../components/ui.jsx';

export function AdminDashboardPage({ onSelectTab, onNavigate, tournamentsCount, registrationsCount }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await authenticatedApi('/api/admin/dashboard-stats');
        if (!cancelled) setStats(result);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    {
      key: 'tournaments',
      title: t('Turnierverwaltung'),
      description: t('Alle Turniere im System verwalten, inklusive gemeldeter Turniere'),
      statLabel: t('Turniere'),
      statValue: tournamentsCount,
      onClick: () => onSelectTab('tournaments'),
    },
    {
      key: 'play',
      title: t('Turnier starten'),
      description: t('Ein laufendes Turnier online steuern und Ergebnisse erfassen'),
      statLabel: null,
      statValue: undefined,
      onClick: () => onSelectTab('play'),
    },
    {
      key: 'registrations',
      title: t('Teilnehmer verwalten'),
      description: t('Anmeldungen und Teilnehmer aller Turniere verwalten'),
      statLabel: t('Anmeldungen'),
      statValue: registrationsCount,
      onClick: () => onSelectTab('registrations'),
    },
    {
      key: 'users',
      title: t('Benutzerverwaltung'),
      description: t('Benutzerkonten anlegen, bearbeiten und löschen'),
      statLabel: t('Benutzer'),
      statValue: stats?.users,
      onClick: () => onSelectTab('users'),
    },
    {
      key: 'clubs',
      title: t('Vereine'),
      description: t('Vereine verwalten, einschließlich Anfragen und Berechtigungen.'),
      statLabel: t('Offene Anfragen'),
      statValue: stats?.pendingClubEditorRequests,
      onClick: () => onSelectTab('clubs'),
    },
    {
      key: 'places',
      title: t('Bouleplätze'),
      description: t('Bouleplätze verwalten, einschließlich Freigaben und Meldungen.'),
      statLabel: t('Offene Vorgänge'),
      statValue: stats ? stats.pendingPlaces + stats.pendingPlaceReports : undefined,
      onClick: () => onSelectTab('places'),
    },
    {
      key: 'apikeys',
      title: t('Alle API-Schlüssel'),
      description: t('API-Schlüssel-Anfragen verwalten'),
      statLabel: t('Offene Anfragen'),
      statValue: stats?.pendingApiKeys,
      onClick: () => onSelectTab('apikeys'),
    },
    {
      key: 'petanque-aktuell-import',
      title: t('Pétanque Aktuell importieren'),
      description: t('Turniere von Pétanque Aktuell importieren'),
      statLabel: null,
      statValue: undefined,
      onClick: () => onSelectTab('petanque-aktuell-import'),
    },
    {
      key: 'player-listings',
      title: t('Mitspielgesuche moderieren'),
      description: t('Alle Mitspielgesuche einsehen und moderieren'),
      statLabel: t('Aktive Gesuche'),
      statValue: stats?.playerListings,
      onClick: () => onNavigate('/meine-anzeigen'),
    },
  ];

  return (
    <section className="single-column">
      <div className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Admin Dashboard')}</h2>
            <p className="muted">{t('Zentraler Einstieg für alle Admin-Funktionen.')}</p>
          </div>
        </div>
        <Feedback error={error} />
        <div className="admin-dashboard-grid" aria-busy={loading}>
          {cards.map((card) => (
            <button key={card.key} type="button" className="admin-dashboard-card" onClick={card.onClick}>
              <span className="admin-dashboard-card-title">{card.title}</span>
              <span className="admin-dashboard-card-description">{card.description}</span>
              {card.statLabel && (
                <span className="admin-dashboard-card-stat">
                  <strong>{card.statValue === undefined ? '–' : card.statValue}</strong>
                  <span>{card.statLabel}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AdminDashboardPage;
