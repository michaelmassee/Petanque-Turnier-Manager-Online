import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/format.js';
import { formatUserMeta, formatUserName } from '../lib/userLabel.js';
import { ComboboxPicker } from './ComboboxPicker.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Stabiler Default: ein neues [] pro Render würde die Einträge neu berechnen und die Auswahl zurücksetzen.
const NO_TOURNAMENTS = [];

function recipientEntry(recipient, group) {
  const name = formatUserName(recipient);
  const meta = formatUserMeta(recipient);
  return {
    id: recipient.id,
    value: recipient.id,
    label: name,
    meta,
    searchText: `${name} ${meta} ${recipient.username || ''}`.toLowerCase(),
    selectedLabel: recipient.username ? `${name} (@${recipient.username})` : name,
    group,
    favoritable: true,
  };
}

// Postbox-Empfänger: Turnier-Broadcasts und Nutzer. onLookupEmail(email) → Empfänger oder null: findet Nutzer
// über die exakte E-Mail, ohne sie anzuzeigen.
export function RecipientPicker({ label, recipients, recipientTournaments = NO_TOURNAMENTS, value, onChange, currentUserId, required, onLookupEmail }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [emailMatches, setEmailMatches] = useState([]);
  const [emailLookupPending, setEmailLookupPending] = useState(false);

  const entries = useMemo(() => {
    const tournamentEntries = recipientTournaments.map((tournament) => {
      // Nur der Turniername: die Gruppe „Turnier-Broadcasts“ sagt bereits, dass alle Teilnehmer erreicht werden.
      const entryLabel = tournament.name;
      // Zweite Zeile wie beim Benutzernamen: Datum und Anzahl der Meldungen.
      const meta = `${formatDate(tournament.date, i18n.language)} · ${t('registrationCount', { count: tournament.registrationCount || 0 })}`;
      return {
        id: `tournament:${tournament.id}`,
        value: `tournament:${tournament.id}`,
        label: entryLabel,
        meta,
        searchText: `${entryLabel} ${meta}`.toLowerCase(),
        // Kurzform fürs Eingabefeld nach der Auswahl, damit es am Handy nicht abgeschnitten wird.
        selectedLabel: `${tournament.name} · ${formatDate(tournament.date, i18n.language)}`,
        group: t('allTournamentsSection'),
      };
    });
    const knownIds = new Set(recipients.map((recipient) => recipient.id));
    const recipientEntries = [...recipients, ...emailMatches.filter((recipient) => !knownIds.has(recipient.id))]
      .map((recipient) => recipientEntry(recipient, t('allRecipientsSection')));
    return [...tournamentEntries, ...recipientEntries];
  }, [recipients, emailMatches, recipientTournaments, t, i18n.language]);

  const trimmedQuery = query.trim().toLowerCase();
  const queryIsEmail = Boolean(onLookupEmail) && EMAIL_PATTERN.test(trimmedQuery);
  useEffect(() => {
    if (!queryIsEmail) return undefined;
    let cancelled = false;
    setEmailLookupPending(true);
    const timer = setTimeout(async () => {
      try {
        const recipient = await onLookupEmail(trimmedQuery);
        if (!cancelled && recipient) {
          setEmailMatches((current) => [...current.filter((entry) => entry.id !== recipient.id), { ...recipient, matchedEmail: trimmedQuery }]);
        }
      } catch {
        // Kein Treffer oder Fehler: Die Liste bleibt leer, die E-Mail wird nicht weiter verraten.
      } finally {
        if (!cancelled) setEmailLookupPending(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [queryIsEmail, trimmedQuery, onLookupEmail]);

  const matchesQuery = useCallback(
    (entry, normalizedQuery) => emailMatches.some((recipient) => recipient.id === entry.id && recipient.matchedEmail === normalizedQuery),
    [emailMatches],
  );

  return (
    <ComboboxPicker
      label={label}
      entries={entries}
      value={value}
      onChange={onChange}
      required={required}
      placeholder={t('searchRecipient')}
      storageScope="postbox"
      currentUserId={currentUserId}
      matchesQuery={matchesQuery}
      onQueryChange={setQuery}
      renderEmpty={() => (
        <>
          {queryIsEmail && emailLookupPending ? t('searchingByEmail') : t('noRecipientsFound')}
          {!queryIsEmail && onLookupEmail ? <span className="recipient-picker-hint">{t('recipientEmailSearchHint')}</span> : null}
        </>
      )}
    />
  );
}
