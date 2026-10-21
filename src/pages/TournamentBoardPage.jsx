import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoutedTournament } from '../lib/hooks.js';
import { isOnlinePlayable } from '../lib/pairing/index.js';
import { formatDate, formatWeekdayShort } from '../lib/format.js';
import { isDocumentBound, formatTournamentStartTime, formatLocationAddress } from '../lib/domain.js';
import { StandalonePageHeader } from '../components/layout.jsx';
import { AnnouncementBanner } from '../components/TournamentAnnouncement.jsx';
import { FinalRankingView } from '../components/FinalRankingView.jsx';
import { TournamentSchedule } from './TournamentDetailPage.jsx';

/**
 * Turnierseite im Vollformat: Ankündigung, Spielplan und Rangliste eines Turniers auf einer eigenen Seite ohne Reiter,
 * z. B. zum Teilen in der Gruppe oder für einen Bildschirm vor Ort. Die Turnierleitung teilt sie unter „Turnier starten“.
 */
export default function TournamentBoardPage({
  tournamentId, tournaments, currentUser, language, setLanguage, navigate, menuOpen, setMenuOpen,
  isAdmin, onSelectAdminDashboard, onLogout, drawerContent, postboxControl,
}) {
  const { t } = useTranslation();
  // Private Turniere (nicht in der öffentlichen Liste) teilt die Turnierleitung mit ihrem Freigabe-Token.
  const shareToken = new URLSearchParams(window.location.search).get('share') || '';
  const { tournament, notFound } = useRoutedTournament(tournamentId, tournaments, shareToken);
  // Aktuelle Ankündigung aus dem Spielplan-Abruf (alle 2 Minuten bzw. sofort nach einem Live-Push).
  const [announcementUpdate, setAnnouncementUpdate] = useState({ tournamentId: null, announcement: null });

  const header = (heading) => (
    <StandalonePageHeader
      heading={heading}
      language={language}
      setLanguage={setLanguage}
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      navigate={navigate}
      currentUser={currentUser}
      isAdmin={isAdmin}
      onSelectAdminDashboard={onSelectAdminDashboard}
      onLogout={onLogout}
      drawerContent={drawerContent}
      postboxControl={postboxControl}
    />
  );

  if (notFound) {
    return (
      <main className="app-shell">
        {header(t('Turnier nicht gefunden'))}
        <section className="home-tournaments">
          <p className="muted">{t('Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.')}</p>
          <button className="link-button" type="button" onClick={() => navigate('/')}>{t('Zur Startseite')}</button>
        </section>
      </main>
    );
  }

  if (!tournament) {
    return <main className="app-shell">{header(t('Turnier wird geladen…'))}</main>;
  }

  const started = tournament.status === 'running' || tournament.status === 'finished';
  const rankingPublished = Boolean(tournament.rankingPublishedAt);
  const participantsVisible = (tournament.participantsPublic || tournament.canManage) && tournament.registrationEnabled !== false;
  const playable = isOnlinePlayable(tournament) || isDocumentBound(tournament);
  const announcement = announcementUpdate.tournamentId === tournament.id ? announcementUpdate.announcement : tournament.announcement;

  let content;
  if (rankingPublished) {
    content = <FinalRankingView tournament={tournament} language={language} shareToken={shareToken} />;
  } else if (!participantsVisible || !playable) {
    content = <p className="muted">{t('Für dieses Turnier gibt es keinen öffentlichen Spielplan.')}</p>;
  } else if (!started) {
    content = <p className="muted">{t('Das Turnier hat noch nicht begonnen. Spielplan und Rangliste erscheinen hier nach dem Start.')}</p>;
  } else {
    content = (
      <TournamentSchedule
        tournamentId={tournament.id}
        tournament={tournament}
        language={language}
        shareToken={shareToken}
        onAnnouncement={(next) => setAnnouncementUpdate({ tournamentId: tournament.id, announcement: next })}
      />
    );
  }

  return (
    <main className="app-shell">
      {header(t('Turnierseite'))}
      <section className="tournament-board-page">
        <header className="tournament-detail-heading">
          <h1 data-i18n-skip>{tournament.name}</h1>
          <p className="tournament-detail-meta" data-i18n-skip>
            <span>{formatWeekdayShort(tournament.date, language)}, {formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)}</span>
            {tournament.club && <span>{tournament.club}</span>}
            <span>{formatLocationAddress(tournament.location)}</span>
          </p>
          <button className="link-button" type="button" onClick={() => navigate(`/turniere/${encodeURIComponent(tournament.id)}/info${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`)}>{t('Turnierdetails')}</button>
        </header>
        <AnnouncementBanner announcement={announcement} language={language} />
        {content}
      </section>
    </main>
  );
}
