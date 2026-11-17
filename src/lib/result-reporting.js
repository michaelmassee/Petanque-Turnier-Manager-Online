// Ergebnismeldung durch Spieler in der Live-Ansicht: Die Meldung nennt genau ein Ergebnis je Partie. Bei Trip-Tête
// besteht eine Begegnung aus drei Partien (Triplette, Doublette, Tête), deren Einzelergebnisse Sieger, Spieldifferenz
// und Punkte bestimmen – ein einzelnes Ergebnis lässt sich nicht übernehmen. Deshalb gibt es dort vorerst keine
// Spielermeldung.
// TODO: Trip-Tête-Meldung mit drei Einzelergebnissen (eigene Maske in der Live-Ansicht, Meldungs-API und
// document_result_reports um die Einzelpartien erweitern, PTM schreibt die sechs Zellen der Begegnung).
const TYPES_WITHOUT_PLAYER_RESULT_REPORTING = new Set(['trip_tete']);

/** Ob Spieler bei diesem Turniersystem Ergebnisse melden können. */
export function supportsPlayerResultReporting(type) {
  return !TYPES_WITHOUT_PLAYER_RESULT_REPORTING.has(type);
}

/** Wirksame Freigabe der Spielermeldung eines gespeicherten Turniers (Datenbankzeile). */
export function playerResultReportingActive(tournament) {
  return Number(tournament?.player_result_reporting_enabled || 0) === 1 && supportsPlayerResultReporting(tournament?.type);
}
