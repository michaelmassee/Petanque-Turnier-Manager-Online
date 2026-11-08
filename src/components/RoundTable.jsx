import { useTranslation } from 'react-i18next';

function playerLabel(player) {
  if (player.teamLabel) return player.teamLabel;
  return [player.firstName, player.lastName].filter(Boolean).join(' ') || player.id;
}

function teamLabel(team) {
  return team.map(playerLabel).join(' + ');
}

// Partien einer Runde als Tabelle wie die Spielrunde im Hauptprojekt (Team A | Team B | Ergebnis A/B); Bahn und Stufe
// nur, wenn die Runde sie hat. Der zweizeilige Kopf entspricht dem der Rangliste, damit beide auf der Turnierseite
// nebeneinander auf gleicher Höhe beginnen. Spielverwaltung (beendetes Turnier) und Turnierseite nutzen dieselbe Tabelle.
export function RoundTable({ round }) {
  const { t } = useTranslation();
  const hasCourt = round.matches.some((match) => match.court);
  const hasStage = round.matches.some((match) => match.stageLabel);
  return (
    <div className="table-scroll">
      <table className="round-table">
        <thead>
          <tr>
            {hasCourt && <th scope="col" rowSpan={2}>{t('Bahn')}</th>}
            {hasStage && <th scope="col" rowSpan={2}>{t('Stufe')}</th>}
            <th scope="col" rowSpan={2}>{t('Team A')}</th>
            <th scope="col" rowSpan={2}>{t('Team B')}</th>
            <th scope="colgroup" colSpan={2} className="round-table-group">{t('Ergebnis')}</th>
          </tr>
          <tr>
            <th scope="col" aria-label={`${t('Ergebnis')} ${t('Team A')}`} data-i18n-skip>A</th>
            <th scope="col" aria-label={`${t('Ergebnis')} ${t('Team B')}`} data-i18n-skip>B</th>
          </tr>
        </thead>
        <tbody>
          {round.matches.map((match) => (
            <tr key={match.id}>
              {hasCourt && <td className="round-table-number" data-i18n-skip>{match.court || ''}</td>}
              {hasStage && <td data-i18n-skip>{match.stageLabel || ''}</td>}
              <td data-i18n-skip>{teamLabel(match.teamA)}</td>
              {match.teamB?.length ? <td data-i18n-skip>{teamLabel(match.teamB)}</td> : <td className="muted">{t('Freilos')}</td>}
              {match.noShow
                ? <td colSpan={2}>{t('Nicht angetreten')}</td>
                : <>
                  <td className="round-table-number">{match.scoreA ?? '–'}</td>
                  <td className="round-table-number">{match.scoreB ?? '–'}</td>
                </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
