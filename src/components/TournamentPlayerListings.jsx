import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { formatLocationAddress } from '../lib/domain.js';
import { Button, Feedback } from './ui.jsx';
import { RichText } from './RichText.jsx';
import { PlayerListingContactDialog } from './PlayerListingContactDialog.jsx';

const PLAYING_POSITION_LABELS = { leger: 'Leger', milieu: 'Milieu', schiesser: 'Schießer', egal: 'Egal' };

// Mitspielgesuche, die mit diesem Turnier verknüpft sind: Antworten per
// Postfach-Nachricht oder direkt ein eigenes Gesuch für das Turnier anlegen.
// Jede Anzeige klappt per Klick auf und zeigt Beschreibung und Aktionen.
export function TournamentPlayerListings({ tournament, currentUser, navigate }) {
  const { t, i18n } = useTranslation();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
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
          {listings.map((listing) => {
            const expanded = expandedId === listing.id;
            const detailsId = `player-listing-${listing.id}`;
            const isOwn = Boolean(currentUser) && listing.userId === currentUser.id;
            return (
              <article className={`listing-row ${expanded ? 'expanded' : ''}`} key={listing.id}>
                <button
                  className="listing-row-toggle"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() => setExpandedId(expanded ? null : listing.id)}
                >
                  <span className="listing-row-summary">
                    <strong data-i18n-skip>{listing.title}</strong>
                    <span>
                      {t(PLAYING_POSITION_LABELS[listing.playingPosition] || 'Egal')}
                      {listing.ownerName ? <> · {t('Von')} <span data-i18n-skip>{listing.ownerName}</span></> : null}
                    </span>
                  </span>
                  <span className="listing-row-chevron" aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="listing-row-details" id={detailsId}>
                    {listing.description && <RichText value={listing.description} />}
                    <p className="muted" data-i18n-skip>
                      {listing.type === 'tournament' ? t('Turnier') : t('Training')}
                      {listing.locationName ? ` · ${formatLocationAddress(listing.locationName)}` : ''}
                      {listing.eventDate ? ` · ${formatDate(listing.eventDate, i18n.language)}` : ''}
                    </p>
                    {currentUser && (
                      <div className="row-actions">
                        {isOwn ? (
                          <Button variant="secondary" onClick={() => navigate(`/meine-anzeigen?${new URLSearchParams({ bearbeiten: listing.id })}`)}>{t('Bearbeiten')}</Button>
                        ) : (
                          <Button variant="secondary" onClick={() => setContactListing(listing)}>{t('Nachricht senden')}</Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
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
