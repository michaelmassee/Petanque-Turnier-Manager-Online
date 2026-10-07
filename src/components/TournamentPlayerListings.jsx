import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { Button, Feedback } from './ui.jsx';
import { PlayerListingContactDialog } from './PlayerListingContactDialog.jsx';

const PLAYING_POSITION_LABELS = { leger: 'Leger', milieu: 'Milieu', schiesser: 'Schießer', egal: 'Egal' };

// Mitspielgesuche, die mit diesem Turnier verknüpft sind: Antworten per
// Postfach-Nachricht oder direkt ein eigenes Gesuch für das Turnier anlegen.
// Ein Klick auf eine Anzeige öffnet sie im Boule-Treff.
export function TournamentPlayerListings({ tournament, currentUser, navigate }) {
  const { t } = useTranslation();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contactListing, setContactListing] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api(`/api/player-listings?${new URLSearchParams({ tournamentId: tournament.id })}`)
      .then((data) => { if (active) setListings(data.listings || []); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tournament.id]);

  return (
    <section className="panel tournament-player-listings">
      <div className="section-title">
        <h2>{t('Mitspielgesuche zu diesem Turnier')}</h2>
        {!loading && <span className="counter">{listings.length}</span>}
      </div>
      <Feedback error={error} />
      {loading ? <p className="muted">{t('Lädt …')}</p> : listings.length === 0 ? (
        <p className="muted">{t('Zu diesem Turnier gibt es noch keine Mitspielgesuche.')}</p>
      ) : (
        <div className="user-list">
          {listings.map((listing) => (
            <article className="data-row" key={listing.id}>
              <div>
                <button
                  className="listing-open"
                  type="button"
                  onClick={() => navigate(`/spielerboerse?${new URLSearchParams({ anzeige: listing.id })}`)}
                >
                  <strong data-i18n-skip>{listing.title}</strong>
                  <span>
                    {t(PLAYING_POSITION_LABELS[listing.playingPosition] || 'Egal')}
                    {listing.ownerName ? <> · {t('Von')} <span data-i18n-skip>{listing.ownerName}{listing.ownerUsername ? ` @${listing.ownerUsername}` : ''}</span></> : null}
                  </span>
                </button>
              </div>
              {currentUser && (
                <div className="row-actions">
                  <Button variant="secondary" disabled={listing.userId === currentUser.id} onClick={() => setContactListing(listing)}>{t('Nachricht senden')}</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {currentUser ? (
        <div className="place-actions">
          <Button onClick={() => navigate(`/meine-anzeigen?${new URLSearchParams({ turnier: tournament.id })}`)}>{t('Mitspieler für dieses Turnier suchen')}</Button>
        </div>
      ) : (
        <p className="hint">{t('Melde dich an, um ein Mitspielgesuch zu erstellen oder zu antworten.')}</p>
      )}
      {contactListing && <PlayerListingContactDialog listing={contactListing} onClose={() => setContactListing(null)} />}
    </section>
  );
}

export default TournamentPlayerListings;
