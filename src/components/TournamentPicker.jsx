import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/format.js';
import { ComboboxPicker } from './ComboboxPicker.jsx';

// Turnierauswahl für Turnierleiter (Meldungen, Turnier starten): wie die Postbox-Empfänger mit Datum und Anzahl
// der Meldungen in der zweiten Zeile, Favoriten und zuletzt verwendet (gemeinsam für beide Seiten).
export function TournamentPicker({ label, tournaments, value, onChange, currentUserId, required }) {
  const { t, i18n } = useTranslation();

  const entries = useMemo(() => tournaments.map((tournament) => {
    const date = formatDate(tournament.date, i18n.language);
    // Wie beim Turnier-Broadcast: offene, bestätigte und Wartelisten-Meldungen.
    const count = Number(tournament.activeRegistrations || 0) + Number(tournament.waitlistRegistrations || 0);
    const meta = `${date} · ${t('registrationCount', { count })}`;
    return {
      id: tournament.id,
      value: tournament.id,
      label: tournament.name,
      meta,
      searchText: `${tournament.name} ${meta}`.toLowerCase(),
      selectedLabel: `${tournament.name} · ${date}`,
      group: t('Alle Turniere'),
      favoritable: true,
    };
  }), [tournaments, t, i18n.language]);

  return (
    <ComboboxPicker
      label={label}
      entries={entries}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={t('Turnier suchen…')}
      emptyText={t('Keine Turniere gefunden.')}
      storageScope="tournaments"
      currentUserId={currentUserId}
      recordRecentOnSelect
    />
  );
}
