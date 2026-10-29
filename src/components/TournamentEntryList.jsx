import { useTranslation } from 'react-i18next';
import { REGISTRATION_STATUSES } from '../lib/constants.js';
import { labelFor } from '../lib/domain.js';
import { AccountBadge } from './ui.jsx';

// Reine Anzeige bis zur ersten Runde: eine Zeile je Meldung, Check-in gilt für das gesamte Team.
export function TournamentEntryList({ entries, scrollRef }) {
  const { t } = useTranslation();
  const confirmed = entries.filter((entry) => entry.status === 'confirmed');
  const checkedIn = confirmed.filter((entry) => entry.participation === 'active').length;
  const checkInLabel = (entry) => entry.participation === 'active' ? t('Eingecheckt.')
    : entry.participation === 'withdrawn' ? t('Ausgesetzt') : t('Noch nicht eingecheckt.');

  return <div className="display-columns">
    <section className="display-entries" aria-label={t('Meldeliste')}>
      <div className="board-entry-heading">
        <h2>{t('Meldeliste')} <span className="counter">{entries.length}</span></h2>
        <span className="muted">{t('Check-in')}: {checkedIn} / {confirmed.length}</span>
      </div>
      <div className="display-scroll" ref={scrollRef}>
        {!entries.length ? <p className="muted">{t('Noch keine Anmeldungen.')}</p> : (
          <ol className="board-entry-list">
            {entries.map((entry, index) => <li className="board-entry" key={index}>
              <span className="board-entry-number" aria-label={`${t('Lfd.-Nr.')} ${index + 1}`}>{index + 1}</span>
              <div className="board-entry-players">
                {entry.teamName && <strong data-i18n-skip>{entry.teamName}</strong>}
                {entry.persons.map((person, personIndex) => <div key={personIndex} data-i18n-skip>
                  <strong>{[person.firstName, person.lastName].filter(Boolean).join(' ')}{person.accountConnected && <AccountBadge />}</strong>
                  {person.club && <small className="muted">{person.club}</small>}
                </div>)}
              </div>
              <div className="board-entry-status">
                {entry.isVip && <span className="vip-badge">{t('VIP')}</span>}
                <span className={`status registration-${entry.status}`}>{labelFor(REGISTRATION_STATUSES, entry.status)}</span>
                {entry.status === 'confirmed' && <span
                  className={`status ${entry.participation === 'active' ? 'registration-confirmed' : 'status-calendar'}`}
                  aria-label={`${t('Check-in')}: ${checkInLabel(entry)}`}>
                  {checkInLabel(entry)}
                </span>}
              </div>
            </li>)}
          </ol>
        )}
      </div>
    </section>
  </div>;
}
