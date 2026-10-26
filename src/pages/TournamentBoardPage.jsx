import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoutedTournament } from '../lib/hooks.js';
import { isOnlinePlayable } from '../lib/pairing/index.js';
import { formatDate, formatWeekdayShort } from '../lib/format.js';
import { isDocumentBound, formatTournamentStartTime, formatLocationAddress } from '../lib/domain.js';
import { StandalonePageHeader } from '../components/layout.jsx';
import { AnnouncementBanner } from '../components/TournamentAnnouncement.jsx';
import { FinalRankingView } from '../components/FinalRankingView.jsx';
import { BoardPushToggle } from '../components/BoardPushToggle.jsx';
import { ScheduleRefreshCountdown, TournamentSchedule, useScheduleQuery } from './TournamentDetailPage.jsx';

// Vollbild-Schalter für die reine Anzeige; verschwindet im Vollbild und in Browsern ohne Fullscreen-API.
function FullscreenButton() {
  const { t } = useTranslation();
  const supported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
  const [active, setActive] = useState(() => supported && Boolean(document.fullscreenElement));
  useEffect(() => {
    if (!supported) return undefined;
    const update = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [supported]);
  if (!supported || active) return null;
  return (
    <button className="button button-secondary display-fullscreen" type="button" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
      {t('Vollbild')}
    </button>
  );
}

/**
 * Turnierseite im Vollformat: Ankündigung, Spielplan und Rangliste eines Turniers auf einer eigenen Seite ohne Reiter,
 * z. B. zum Teilen in der Gruppe oder für einen Bildschirm vor Ort. Die Turnierleitung teilt sie unter „Turnier starten“.
 * Mit display (/turnierseite/<id>/anzeige) ohne Menü und Bedienelemente als reine Anzeige für einen zweiten Bildschirm.
 */
export default function TournamentBoardPage({
  tournamentId, tournaments, currentUser, language, setLanguage, navigate, menuOpen, setMenuOpen,
  isAdmin, onSelectAdminDashboard, onLogout, drawerContent, postboxControl, display = false,
}) {
  const { t } = useTranslation();
  // Private Turniere (nicht in der öffentlichen Liste) teilt die Turnierleitung mit ihrem Freigabe-Token.
  const shareToken = new URLSearchParams(window.location.search).get('share') || '';
  const { tournament, notFound } = useRoutedTournament(tournamentId, tournaments, shareToken);
  // Aktuelle Ankündigung aus dem Spielplan-Abruf (alle 2 Minuten bzw. sofort nach einem Live-Push).
  const [announcementUpdate, setAnnouncementUpdate] = useState({ tournamentId: null, announcement: null });
  const rankingPublished = Boolean(tournament?.rankingPublishedAt);
  const participantsVisible = Boolean(tournament && (tournament.participantsPublic || tournament.canManage) && tournament.registrationEnabled !== false);
  const playable = Boolean(tournament) && (isOnlinePlayable(tournament) || isDocumentBound(tournament));
  // Der Status aus der Turnierliste stammt vom Laden der App. Eine vor dem Start geöffnete Seite (z. B. Bildschirm vor
  // Ort) erfährt den Start aus dem Spielplan-Abruf (Polling + Live-Push) und schaltet ohne Neuladen auf den Spielplan um.
  const scheduleVisible = Boolean(!rankingPublished && participantsVisible && playable);
  const scheduleQuery = useScheduleQuery(tournament?.id, shareToken, scheduleVisible);

  const header = (heading) => (display ? null : (
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
  ));
  const shellClass = display ? 'app-shell tournament-display' : 'app-shell';

  if (notFound) {
    return (
      <main className={shellClass}>
        {header(t('Turnier nicht gefunden'))}
        <section className="home-tournaments">
          <p className="muted">{t('Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.')}</p>
          {!display && <button className="link-button" type="button" onClick={() => navigate('/')}>{t('Zur Startseite')}</button>}
        </section>
      </main>
    );
  }

  if (!tournament) {
    return <main className={shellClass}>{display ? <p className="muted">{t('Turnier wird geladen…')}</p> : header(t('Turnier wird geladen…'))}</main>;
  }

  const status = scheduleQuery.data?.status || tournament.status;
  // Sofort-Aktualisierung per Push lohnt nur, solange noch Runden kommen.
  const pushToggle = scheduleVisible && status !== 'finished'
    ? <BoardPushToggle tournamentId={tournament.id} shareToken={shareToken} language={language} />
    : null;
  const started = status === 'running' || status === 'finished';
  const announcement = announcementUpdate.tournamentId === tournament.id ? announcementUpdate.announcement : tournament.announcement;

  let content;
  if (rankingPublished) {
    content = <FinalRankingView tournament={tournament} language={language} shareToken={shareToken} display={display} />;
  } else if (!participantsVisible || !playable) {
    content = <p className="muted">{t('Für dieses Turnier gibt es keinen öffentlichen Spielplan.')}</p>;
  } else if (!started) {
    content = (
      <>
        <p className="muted">{t('Das Turnier hat noch nicht begonnen. Spielplan und Rangliste erscheinen hier nach dem Start.')}</p>
        {/* Auch vor dem Start sichtbar, dass die Seite von selbst auf den Spielplan umschaltet. */}
        <p className="muted"><ScheduleRefreshCountdown query={scheduleQuery} /></p>
      </>
    );
  } else {
    content = (
      <TournamentSchedule
        tournamentId={tournament.id}
        tournament={tournament}
        language={language}
        shareToken={shareToken}
        onAnnouncement={(next) => setAnnouncementUpdate({ tournamentId: tournament.id, announcement: next })}
        display={display}
      />
    );
  }

  return (
    <main className={shellClass}>
      {header(t('Turnierseite'))}
      <section className="tournament-board-page">
        <header className="tournament-detail-heading">
          <h1 data-i18n-skip>{tournament.name}</h1>
          <p className="tournament-detail-meta" data-i18n-skip>
            <span>{formatWeekdayShort(tournament.date, language)}, {formatDate(tournament.date, language)} {formatTournamentStartTime(tournament, language)}</span>
            {tournament.club && <span>{tournament.club}</span>}
            <span>{formatLocationAddress(tournament.location)}</span>
          </p>
          {!display && <button className="link-button" type="button" onClick={() => navigate(`/turniere/${encodeURIComponent(tournament.id)}/info${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''}`)}>{t('Turnierdetails')}</button>}
        </header>
        {display ? <div className="display-actions">{pushToggle}<FullscreenButton /></div> : pushToggle}
        <AnnouncementBanner announcement={announcement} language={language} />
        {content}
      </section>
    </main>
  );
}
