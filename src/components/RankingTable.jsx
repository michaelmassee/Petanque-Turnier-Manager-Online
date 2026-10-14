import { useTranslation } from 'react-i18next';
import { rankingColumnKeys } from '../lib/live-ranking.js';

function columnLabel(key, tournament, t) {
  switch (key) {
    case 'rank': return t('Platz');
    case 'label': return tournament?.registrationType === 'supermelee' ? t('Spieler') : t('Team');
    case 'wins': return t('Siege');
    case 'bhz': return t('BHZ');
    case 'fbhz': return t('FBHZ');
    case 'wertung': return t('Wertung');
    case 'losses': return t('Niederlagen');
    case 'gameDiff': return t('Spieldifferenz');
    case 'pointsFor': return t('Punkte+');
    case 'pointsAgainst': return t('Punkte−');
    default: return t('Δ');
  }
}

/**
 * Rangliste mit den Spalten des Turniersystems – dieselbe Darstellung in Live-Ansicht, öffentlichem Spielplan und
 * Spielverwaltung, für online durchgeführte wie für mit einem Turnierdokument verbundene Turniere.
 *
 * @param entries normalisierte Einträge (siehe normalizeRanking); `own` markiert die eigene Zeile
 */
export function RankingTable({ tournament, entries }) {
  const { t } = useTranslation();
  const columns = rankingColumnKeys(tournament, entries);
  return (
    <table className="ranking-table">
      <thead>
        <tr>
          {columns.map((key) => <th key={key}>{columnLabel(key, tournament, t)}</th>)}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.registrationIds.join('-')} className={entry.own ? 'live-own-row' : undefined}>
            {columns.map((key) => <td key={key} data-i18n-skip={key === 'label' || undefined}>{entry[key] ?? '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
