const isOpenMatch = (match) => match.teamB?.length > 0 && !match.noShow
  && (match.scoreA === null || match.scoreA === undefined) && (match.scoreB === null || match.scoreB === undefined);
const matchRegistrationIds = (match) => [...(match.teamA || []), ...(match.teamB || [])].map((member) => member.id);

/**
 * Die gerade laufenden Partien (Runden im Format von loadTournamentRounds): alle Partien der letzten Runde und davor
 * die offenen Partien früherer Runden, deren Teams seitdem nicht neu eingeteilt sind. Bei gleichzeitig gespielten
 * KO-Bäumen ist Baum A womöglich schon im Halbfinale, während Baum B noch sein Viertelfinale spielt – beide gehören
 * zur aktuellen Anzeige.
 *
 * @returns {{ roundNumber: number, matches: object[] } | null} roundNumber der letzten Runde; null ohne Runden
 */
export function currentRoundView(rounds) {
  if (!rounds?.length) return null;
  const last = rounds[rounds.length - 1];
  const laterIds = new Set(last.matches.flatMap(matchRegistrationIds));
  const carriedOver = [];
  for (let index = rounds.length - 2; index >= 0; index -= 1) {
    const { matches } = rounds[index];
    carriedOver.unshift(...matches.filter((match) => isOpenMatch(match)
      && !matchRegistrationIds(match).some((id) => laterIds.has(id))));
    matches.flatMap(matchRegistrationIds).forEach((id) => laterIds.add(id));
  }
  return { ...last, matches: [...carriedOver, ...last.matches] };
}

const isDecided = (match) => Boolean(match.noShow)
  || (match.scoreA !== null && match.scoreA !== undefined && match.scoreB !== null && match.scoreB !== undefined);

// KO-Partien je Turnierart: beim KO-Turnier jede Partie, bei Maastrichter die Finalrunden (nur sie tragen eine Stufe
// wie „A-Finale · 1/4-Finale“). Poule und Kaskade bleiben außen vor: Dort tragen auch Gruppenspiele eine Stufe.
const KO_MATCH = {
  ko: () => true,
  maastrichter: (match) => Boolean(match.stageLabel),
};

/**
 * Bereits gespielte KO-Partien früherer Runden, die die aktuelle Anzeige nicht mehr zeigt – damit Ergebnisse der
 * KO-Phase auf der Turnierseite stehen bleiben. Neueste Runde zuerst, innerhalb einer Runde in Spielplanreihenfolge;
 * ohne Freilose.
 *
 * @param current Ergebnis von currentRoundView
 * @returns {{ matches: object[] }} leer bei anderen Turnierarten oder ohne gespielte KO-Partien
 */
export function playedKoMatches(rounds, current, tournamentType) {
  const isKoMatch = KO_MATCH[tournamentType];
  if (!isKoMatch) return { matches: [] };
  const shown = new Set((current?.matches || []).map((match) => match.id));
  const matches = [...(rounds || [])].reverse().flatMap((round) => round.matches.filter((match) => isKoMatch(match)
    && match.teamB?.length > 0 && isDecided(match) && !shown.has(match.id)));
  return { matches };
}
