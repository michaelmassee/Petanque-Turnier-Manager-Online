import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/format.js';
import { ComboboxPicker } from './ComboboxPicker.jsx';

// Turnierauswahl für Turnierleiter (Meldungen, Turnier starten): wie die Postbox-Empfänger mit Datum und Anzahl
// der Meldungen in der zweiten Zeile, Favoriten und zuletzt verwendet (gemeinsam für beide Seiten).
// isUnavailable: Turniere, die auswählbar bleiben, aber rot als „nicht online durchführbar“ markiert werden.
export function TournamentPicker({ label, tournaments, value, onChange, currentUserId, required, isUnavailable }) {
  const { t, i18n } = useTranslation();

  const entries = useMemo(() => tournaments.map((tournament) => {
    const date = formatDate(tournament.date, i18n.language);
    // Wie beim Turnier-Broadcast: offene, bestätigte und Wartelisten-Meldungen.
    const count = Number(tournament.activeRegistrations || 0) + Number(tournament.waitlistRegistrations || 0);
    const unavailable = Boolean(isUnavailable?.(tournament));
    const meta = unavailable ? `${t('Nicht online durchführbar')} · ${date}` : `${date} · ${t('registrationCount', { count })}`;
    return {
      unavailable,
      id: tournament.id,
      value: tournament.id,
      label: tournament.name,
      meta,
      searchText: `${tournament.name} ${meta}`.toLowerCase(),
      selectedLabel: `${tournament.name} · ${date}`,
      group: t('Alle Turniere'),
      favoritable: true,
    };
  }), [tournaments, isUnavailable, t, i18n.language]);

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
