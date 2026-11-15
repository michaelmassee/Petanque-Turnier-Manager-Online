import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { REGISTRATION_STATUSES } from '../lib/constants.js';
import { labelFor } from '../lib/domain.js';
import { formatTournamentDateTime } from '../lib/format.js';
import { vipLevelInfo } from '../lib/vip.js';
import { EditDialog, Feedback } from './ui.jsx';

const foldText = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function slotNumber(target) {
  return String(target || '').startsWith('slot:') ? target.slice(5) : '';
}

function statusLabel(status) {
  return status ? labelFor(REGISTRATION_STATUSES, status) : '–';
}

function vipLabel(level, t) {
  const info = vipLevelInfo(level);
  return info ? t(info.label) : t('kein VIP');
}

/** Lesbarer Text eines Protokolleintrags; unbekannte Aktionen bleiben als Schlüssel sichtbar statt zu verschwinden. */
export function registrationLogText(entry, t) {
  const { details = {} } = entry;
  const slot = slotNumber(entry.target);
  switch (entry.action) {
    case 'registration_created':
      return t('Angemeldet ({{status}})', { status: statusLabel(details.status) });
    case 'registration_deleted':
      return t('Meldung gelöscht (zuletzt {{status}})', { status: statusLabel(details.status) });
    case 'status_changed': {
      const text = t('Status: {{from}} → {{to}}', { from: statusLabel(details.from), to: statusLabel(details.to) });
      if (details.reason) return `${text} – ${details.reason}`;
      return details.bulk ? `${text} (${t('Alle bestätigen')})` : text;
    }
    case 'vip_displaced':
      return t('Von einer VIP-Meldung verdrängt → {{to}}', { to: statusLabel(details.to) });
    case 'waitlist_promoted':
      return t('Von der Warteliste nachgerückt → {{to}}', { to: statusLabel(details.status) });
    case 'registration_over_capacity':
      return t('Über die Kapazität nachgemeldet');
    case 'composition_changed':
      return t('Spieler {{slot}}: {{from}} → {{to}}', { slot, from: details.from || '–', to: details.to || '–' });
    case 'team_name_changed':
      return t('Teamname: {{from}} → {{to}}', { from: details.from || '–', to: details.to || '–' });
    case 'vip_changed':
      return t('VIP-Stufe: {{from}} → {{to}}', { from: vipLabel(details.from, t), to: vipLabel(details.to, t) });
    case 'contact_email_changed':
      return t('Kontakt-E-Mail: {{from}} → {{to}}', { from: details.from || '–', to: details.to || '–' });
    case 'slot_email_changed':
      return t('E-Mail Spieler {{slot}}: {{from}} → {{to}}', { slot, from: details.from || '–', to: details.to || '–' });
    case 'account_linked':
      return t('Spieler {{slot}} mit einem Konto verknüpft', { slot });
    case 'account_unlinked':
      return t('Kontoverknüpfung von Spieler {{slot}} gelöst', { slot });
    case 'account_relinked':
      return t('Spieler {{slot}} einem anderen Konto zugeordnet', { slot });
    case 'team_message_sent':
      return t('Nachricht an das Team gesendet');
    case 'registration_player_details':
      return t('Spielerdaten ergänzt');
    default:
      return entry.action;
  }
}

const ROLE_LABELS = {
  owner: 'Turnierleitung',
  editor: 'Mitverwaltung',
  admin: 'Admin',
  organizer: 'Turnierleitung',
  registrant: 'Anmeldeformular',
  player: 'Spieler',
  document: 'Turnierdokument (PTM)',
  system: 'Automatisch',
};

export function registrationLogActor(entry, t) {
  const role = ROLE_LABELS[entry.actorRole] ? t(ROLE_LABELS[entry.actorRole]) : entry.actorRole || '';
  return entry.actorName ? `${entry.actorName} (${role})` : role;
}

/** Änderungshistorie der Meldeliste (nur Turnierleitung): chronologisch, neueste zuerst, durchsuchbar. */
export function RegistrationLogDialog({ tournament, onClose }) {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState(null);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    authenticatedApi(`/api/tournaments/${tournament.id}/registration-log`)
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries || []);
        setLimit(data.limit || 0);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      });
    return () => { cancelled = true; };
  }, [tournament.id]);

  const foldedQuery = foldText(query.trim());
  const visibleEntries = (entries || []).filter((entry) => !foldedQuery
    || foldText([entry.participant, registrationLogText(entry, t), registrationLogActor(entry, t)].join(' ')).includes(foldedQuery));

  return (
    <EditDialog open title={t('Protokoll der Meldeliste')} subtitle={tournament.name} onClose={onClose} wide>
      <Feedback error={error} />
      {!entries && !error && <p className="muted">{t('Protokoll wird geladen…')}</p>}
      {entries && entries.length === 0 && <p className="muted">{t('Noch keine Änderungen protokolliert.')}</p>}
      {entries && entries.length > 0 && (
        <>
          <label className="participants-search">
            {t('Protokoll durchsuchen')}
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {visibleEntries.length === 0 && <p className="muted">{t('Keine Einträge passen zur Suche.')}</p>}
          <ol className="registration-log">
            {visibleEntries.map((entry) => (
              <li key={entry.id} className="registration-log-entry">
                <time dateTime={entry.createdAt} className="muted">{formatTournamentDateTime(entry.createdAt, i18n.language, tournament.timezone)}</time>
                <strong data-i18n-skip>{entry.participant || t('Unbekannte Meldung')}</strong>
                <span>{registrationLogText(entry, t)}</span>
                <small className="muted">{registrationLogActor(entry, t)}</small>
              </li>
            ))}
          </ol>
          {limit > 0 && entries.length >= limit && <p className="muted">{t('Es werden die letzten {{count}} Einträge angezeigt.', { count: limit })}</p>}
        </>
      )}
    </EditDialog>
  );
}
