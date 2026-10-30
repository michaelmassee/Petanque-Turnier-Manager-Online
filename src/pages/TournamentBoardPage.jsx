import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoutedTournament } from '../lib/hooks.js';
import { isOnlinePlayable } from '../lib/pairing/index.js';
import { formatDate, formatWeekdayShort } from '../lib/format.js';
import { isDocumentBound, formatTournamentStartTime } from '../lib/domain.js';
import { AnnouncementBanner } from '../components/TournamentAnnouncement.jsx';
import { FinalRankingView } from '../components/FinalRankingView.jsx';
import { TournamentClub, TournamentLocation, TournamentSchedule } from './TournamentDetailPage.jsx';

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
 * Turnierseite: Ankündigung, Spielplan und Rangliste eines Turniers als reine Anzeige ohne Menü und Bedienelemente,
 * für einen Bildschirm vor Ort ebenso wie für Spieler am Handy. Die Turnierleitung teilt sie unter „Turnier starten“.
 */
export default function TournamentBoardPage({ tournamentId, tournaments, language }) {
  const { t } = useTranslation();
  // Private Turniere (nicht in der öffentlichen Liste) teilt die Turnierleitung mit ihrem Freigabe-Token.
  const shareToken = new URLSearchParams(window.location.search).get('share') || '';
  const { tournament, notFound } = useRoutedTournament(tournamentId, tournaments, shareToken);
  // Aktuelle Ankündigung aus dem Spielplan-Abruf (sofort über den WebSocket, sonst alle 2 Minuten).
  const [announcementUpdate, setAnnouncementUpdate] = useState({ tournamentId: null, announcement: null });
  const rankingPublished = Boolean(tournament?.rankingPublishedAt);
  const participantsVisible = Boolean(tournament && (tournament.participantsPublic || tournament.canManage) && tournament.registrationEnabled !== false);
  const playable = Boolean(tournament) && (isOnlinePlayable(tournament) || isDocumentBound(tournament));
  // Der Status aus der Turnierliste stammt vom Laden der App. Eine vor dem Start geöffnete Seite (z. B. Bildschirm vor
  // Ort) erfährt den Start aus dem Spielplan-Abruf (WebSocket bzw. Polling) und schaltet ohne Neuladen auf den Spielplan um.
  const scheduleVisible = Boolean(!rankingPublished && participantsVisible && playable);

  const shellClass = 'app-shell tournament-display';

  if (notFound) {
    return (
      <main className={shellClass}>
        <h1>{t('Turnier nicht gefunden')}</h1>
        <section className="home-tournaments">
          <p className="muted">{t('Dieses Turnier existiert nicht oder ist nicht öffentlich sichtbar.')}</p>
          <a href="/">{t('Zur Startseite')}</a>
        </section>
      </main>
    );
  }

  if (!tournament) {
    return <main className={shellClass}><p className="muted">{t('Turnier wird geladen…')}</p></main>;
  }

  const announcement = announcementUpdate.tournamentId === tournament.id ? announcementUpdate.announcement : tournament.announcement;

  let content;
  if (rankingPublished) {
    content = <FinalRankingView tournament={tournament} language={language} shareToken={shareToken} display />;
  } else if (!participantsVisible || !playable) {
    content = <p className="muted">{t('Für dieses Turnier gibt es keinen öffentlichen Spielplan.')}</p>;
  } else {
    content = (
      <TournamentSchedule
        tournamentId={tournament.id}
        tournament={tournament}
        language={language}
        shareToken={shareToken}
        onAnnouncement={(next) => setAnnouncementUpdate({ tournamentId: tournament.id, announcement: next })}
        display
      />
    );
  }

  return (
    <main className={shellClass}>
      <section className="tournament-board-page">
        <header className="tournament-detail-heading">
          <h1 data-i18n-skip>{tournament.name}</h1>
          <p className="tournament-detail-meta" data-i18n-skip>
            {/* Ohne Uhrzeit nur das Datum: „Ganztägig“ sagt auf der Anzeige nichts. */}
            <span>{formatWeekdayShort(tournament.date, language)}, {formatDate(tournament.date, language)}{tournament.startTime ? ` ${formatTournamentStartTime(tournament, language)}` : ''}</span>
            <TournamentClub tournament={tournament} shareToken={shareToken} />
            <TournamentLocation tournament={tournament} />
          </p>
        </header>
        <div className="display-actions"><FullscreenButton /></div>
        <AnnouncementBanner announcement={announcement} language={language} />
        {content}
      </section>
    </main>
  );
}
