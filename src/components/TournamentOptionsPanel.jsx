import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { getPlaySystemKey } from '../lib/pairing/index.js';
import { Button, Feedback, IntegerField, SelectField } from './ui.jsx';

// Spielbahn wie im Hauptprojekt (SpielrundeSpielbahn): X keine, L händisch, N 1..n, R zufällig.
export const COURT_MODE_OPTIONS = [
  { value: 'X', label: 'Keine Bahn (nur laufende Nr.)' },
  { value: 'L', label: 'Leer (Bahn händisch eintragen)' },
  { value: 'N', label: 'Durchnummerieren (1-n)' },
  { value: 'R', label: 'Zufällig vergeben' },
];

// Team-Anzeige wie im Hauptprojekt (TeamAnzeige): Teamnummer, Spielernamen oder Teamname.
export const TEAM_DISPLAY_OPTIONS = [
  { value: 'NAME', label: 'Teamname (sonst Spielernamen)' },
  { value: 'SPIELERNAMEN', label: 'Spielernamen' },
  { value: 'NR', label: 'Teamnummer' },
];

// Mêlée-Teams wie MeleeAnmeldungModus im Hauptprojekt.
export const MELEE_TEAM_MODE_OPTIONS = [
  { value: 'EINFACH', label: 'Feste Teamgröße aus der Formation (Freilos möglich)' },
  { value: 'DOUBLETTE_OHNE_FREILOS', label: 'Ohne Freilos, Doubletten bevorzugt' },
  { value: 'TRIPLETTE_OHNE_FREILOS', label: 'Ohne Freilos, Triplettes bevorzugt' },
];

// Buchholz-Wertung eines Freiloses im Schweizer System wie FreilosBuchholz im Hauptprojekt (03_Schweizer.md 5.1).
export const BYE_BUCHHOLZ_OPTIONS = [
  { value: 'neutral', label: 'Neutral (fiktiver Durchschnittsgegner)' },
  { value: 'null', label: 'Null (BPV-Regel: 0 Buchholz)' },
];

// Standardwerte wie Migrationen 0154/0155/0157 bzw. Hauptprojekt.
export const DEFAULT_TOURNAMENT_OPTIONS = {
  courtMode: 'X', byePointsFor: 13, byePointsAgainst: 7, missedRoundPointsFor: 0, missedRoundPointsAgainst: 13,
  koGroupSize: 16, koMinLastGroupSize: 4, koCourtFirstRoundOnly: true, teamDisplayRound: 'NAME', teamDisplayRanking: 'NAME',
  roundRobinReturn: false, meleeTeamMode: 'EINFACH', byeBuchholz: 'null',
};

// Welche Optionen das Turniersystem kennt – wie die Konfiguration je System im Hauptprojekt.
export function tournamentOptionFields(tournament) {
  const system = getPlaySystemKey(tournament);
  const fixedTeams = system !== 'supermelee';
  return {
    bye: ['schweizer', 'jeder_gegen_jeden', 'formule_x'].includes(system),
    missedRound: system === 'supermelee',
    ko: system === 'ko',
    teamDisplayRound: fixedTeams,
    teamDisplayRanking: fixedTeams && system !== 'ko',
    roundRobinReturn: system === 'jeder_gegen_jeden',
    meleeTeamMode: fixedTeams && (tournament.registrationType ?? tournament.registration_type) === 'melee',
    // Nur mit Buchholz-Wertung sinnvoll; bei „Ohne Buchholz“ hat die Einstellung keine Wirkung.
    byeBuchholz: system === 'schweizer'
      && (tournament.schweizerRankingMode ?? tournament.schweizer_ranking_mode ?? 'mit_buchholz') === 'mit_buchholz',
  };
}

// Nur die Werte, die das System kennt – der Server prüft Paare (Plus/Minus, Gruppengrößen) gemeinsam.
function payloadFor(fields, options) {
  return {
    courtMode: options.courtMode,
    ...(fields.bye ? { byePointsFor: options.byePointsFor, byePointsAgainst: options.byePointsAgainst } : {}),
    ...(fields.missedRound ? { missedRoundPointsFor: options.missedRoundPointsFor, missedRoundPointsAgainst: options.missedRoundPointsAgainst } : {}),
    ...(fields.ko ? { koGroupSize: options.koGroupSize, koMinLastGroupSize: options.koMinLastGroupSize, koCourtFirstRoundOnly: options.koCourtFirstRoundOnly } : {}),
    ...(fields.teamDisplayRound ? { teamDisplayRound: options.teamDisplayRound } : {}),
    ...(fields.teamDisplayRanking ? { teamDisplayRanking: options.teamDisplayRanking } : {}),
    ...(fields.roundRobinReturn ? { roundRobinReturn: options.roundRobinReturn } : {}),
    ...(fields.meleeTeamMode ? { meleeTeamMode: options.meleeTeamMode } : {}),
    ...(fields.byeBuchholz ? { byeBuchholz: options.byeBuchholz } : {}),
  };
}

// Turnieroptionen der Spielverwaltung, zwischen Ankündigung und Teilnehmern. Wirkt sofort auf die aktuelle Runde.
// onSaved(options): die Seite führt den Stand selbst nach, weil die Turnierliste nicht neu geladen wird.
export function TournamentOptionsPanel({ tournament, options, onSaved }) {
  const { t } = useTranslation();
  const fields = tournamentOptionFields(tournament);
  const [draft, setDraft] = useState(options);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Inhaltlich vergleichen: Die Seite liefert bei jedem Rendern ein neues Objekt, der Entwurf soll nur bei echten
  // Änderungen (Turnierwechsel, gespeicherter Stand) zurückgesetzt werden. Der Turnierwechsel zählt auch dann, wenn
  // beide Turniere dieselben gespeicherten Optionen haben – sonst landete ein ungespeicherter Entwurf im anderen Turnier.
  const optionsKey = JSON.stringify(options);
  useEffect(() => setDraft(JSON.parse(optionsKey)), [optionsKey, tournament.id]);
  // Nur beim Turnierwechsel leeren – sonst verschwände die Erfolgsmeldung, sobald der gespeicherte Stand ankommt.
  useEffect(() => {
    setError('');
    setMessage('');
  }, [tournament.id]);

  const payload = payloadFor(fields, draft);
  const changed = JSON.stringify(payload) !== JSON.stringify(payloadFor(fields, options));
  const incomplete = Object.values(payload).some((value) => value === '');
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const setNumber = (key) => (value) => set(key)(value === '' ? '' : Number(value));
  const checkbox = (key, label) => (
    <label className="checkbox-field">
      <input type="checkbox" checked={Boolean(draft[key])} disabled={busy} onChange={(event) => set(key)(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
  const teamDisplayOptions = TEAM_DISPLAY_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }));

  async function save() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const data = await authenticatedApi(`/api/tournaments/${tournament.id}/options`, { method: 'PUT', body: JSON.stringify(payload) });
      onSaved(data);
      setMessage(t('Turnieroptionen gespeichert.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel tournament-options">
      <summary>{t('Turnieroptionen')}</summary>
      <div className="form">
        <SelectField label={t('Spielbahn')} value={draft.courtMode} onChange={set('courtMode')} disabled={busy}
          options={COURT_MODE_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />
        {fields.ko && checkbox('koCourtFirstRoundOnly', t('Bahn nur in Runde 1 (bei Cadrage die Cadrage-Runde)'))}
        <p className="hint">{t('Gilt sofort für die aktuelle Runde und jede weitere. Frühere Runden bleiben unverändert. Freilose bekommen keine Bahn.')}</p>

        {fields.bye && (
          <fieldset className="options-pair">
            <legend>{t('Freilos')}</legend>
            <IntegerField label={t('Pluspunkte')} min={0} max={13} value={draft.byePointsFor} onChange={setNumber('byePointsFor')} disabled={busy} />
            <IntegerField label={t('Minuspunkte')} min={0} max={13} value={draft.byePointsAgainst} onChange={setNumber('byePointsAgainst')} disabled={busy} />
            <p className="hint">{t('Ein Freilos zählt als Sieg mit diesen Punkten, auch rückwirkend für bereits gespielte Runden.')}</p>
          </fieldset>
        )}

        {fields.byeBuchholz && (
          <>
            <SelectField label={t('Buchholz-Wertung des Freiloses')} value={draft.byeBuchholz} onChange={set('byeBuchholz')} disabled={busy}
              options={BYE_BUCHHOLZ_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />
            <p className="hint">{t('Neutral: Das Freilos zählt wie ein Gegner mit ausgeglichener Bilanz, je Freilos (Runden − 1) / 2 Buchholz, abgerundet. Null: kein Buchholz für das Freilos. Die Rangliste wird sofort neu berechnet.')}</p>
          </>
        )}

        {fields.missedRound && (
          <fieldset className="options-pair">
            <legend>{t('Nicht gespielte Runde')}</legend>
            <IntegerField label={t('Pluspunkte')} min={0} max={13} value={draft.missedRoundPointsFor} onChange={setNumber('missedRoundPointsFor')} disabled={busy} />
            <IntegerField label={t('Minuspunkte')} min={0} max={13} value={draft.missedRoundPointsAgainst} onChange={setNumber('missedRoundPointsAgainst')} disabled={busy} />
            <p className="hint">{t('Wer in einer Runde fehlt (ausgesetzt, später gekommen), bekommt diese Punkte; mehr Minus- als Pluspunkte zählen als Niederlage.')}</p>
          </fieldset>
        )}

        {fields.ko && (
          <fieldset className="options-pair">
            <legend>{t('Turnierbaum')}</legend>
            <IntegerField label={t('Maximale Teams pro Gruppe')} min={2} max={256} value={draft.koGroupSize} onChange={setNumber('koGroupSize')} disabled={busy} />
            <IntegerField label={t('Mindestgröße der letzten Gruppe')} min={2} max={256} value={draft.koMinLastGroupSize} onChange={setNumber('koMinLastGroupSize')} disabled={busy} />
            <p className="hint">{t('Bei mehr Teams entstehen mehrere Gruppen A, B, C …; eine zu kleine letzte Gruppe wird in die vorherige aufgenommen. Gilt beim Auslosen der ersten Runde.')}</p>
          </fieldset>
        )}

        {fields.teamDisplayRound && (
          <SelectField label={t('Team-Anzeige in der Spielrunde')} value={draft.teamDisplayRound} onChange={set('teamDisplayRound')} disabled={busy} options={teamDisplayOptions} />
        )}
        {fields.teamDisplayRanking && (
          <SelectField label={t('Team-Anzeige in der Rangliste')} value={draft.teamDisplayRanking} onChange={set('teamDisplayRanking')} disabled={busy} options={teamDisplayOptions} />
        )}

        {fields.meleeTeamMode && (
          <>
            <SelectField label={t('Mêlée-Teams')} value={draft.meleeTeamMode} onChange={set('meleeTeamMode')} disabled={busy}
              options={MELEE_TEAM_MODE_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))} />
            <p className="hint">{t('Ohne Freilos entstehen gemischte 2er- und 3er-Teams wie im Supermêlée, immer eine gerade Teamzahl. Gilt für die nächste Auslosung.')}</p>
          </>
        )}

        {fields.roundRobinReturn && checkbox('roundRobinReturn', t('Rückrunde spielen (Hin- und Rückrunde mit getauschten Seiten)'))}

        <div className="row-actions">
          <Button disabled={busy || !changed || incomplete} loading={busy} onClick={save}>{t('Speichern')}</Button>
        </div>
      </div>
      <Feedback error={error} />
      <Feedback message={message} />
    </details>
  );
}
