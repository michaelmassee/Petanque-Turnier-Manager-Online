import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { playerSearchTurnstileToken } from '../lib/player-search-turnstile.js';
import { Button, Feedback, TextField } from './ui.jsx';

export function RegistrationPlayerPicker({ tournamentId, siteKey, shareToken, selected, excludedIds, onSelect, onClear }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const container = useRef(null);
  const active = useRef(null);
  useEffect(() => () => active.current?.abort(), []);

  async function request(kind, payload) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError('');
    try {
      let turnstileToken;
      try {
        turnstileToken = await playerSearchTurnstileToken(container.current, siteKey, `registration_player_${kind}`, i18n.language, controller.signal);
      } catch {
        throw new Error(t('Sicherheitsprüfung fehlgeschlagen. Bitte erneut versuchen.'));
      }
      const data = await authenticatedApi(`/api/tournaments/${encodeURIComponent(tournamentId)}/registration-players/${kind}`, {
        method: 'POST', body: JSON.stringify({ ...payload, turnstileToken, shareToken }), signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (kind === 'search') setPlayers(data.players);
      else { onSelect(data.player); setOpen(false); setPlayers(null); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (active.current === controller) active.current = null;
    }
  }

  if (selected) return <div className="registration-player-picker">
    <span>{t('Mit Benutzerkonto verbunden')}</span>{' '}
    <Button variant="secondary" onClick={onClear}>{t('Auswahl aufheben')}</Button>
  </div>;

  return <div className="registration-player-picker">
    {!open ? <Button variant="secondary" onClick={() => setOpen(true)}>{t('Registrierten Spieler suchen')}</Button> : <>
      <TextField label={t('Name, @Benutzername, Verein oder vollständige E-Mail-Adresse')}
        type="search" value={query} maxLength={100} disabled={busy}
        onChange={(value) => { setQuery(value); setPlayers(null); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); if (!busy && query.trim().length >= 3) request('search', { query }); }
        }} />
      <p className="hint">{t('Nach der Auswahl werden E-Mail und Lizenznummer aus dem Profil übernommen.')}</p>
      <div className="row-actions">
        <Button variant="secondary" loading={busy} disabled={query.trim().length < 3 || !siteKey}
          onClick={() => request('search', { query })}>{t('Suchen')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setOpen(false); setError(''); setPlayers(null); }}>{t('Abbrechen')}</Button>
      </div>
      {!siteKey && <Feedback error={t('Die Spielersuche ist derzeit nicht verfügbar.')} />}
      <div ref={container} />
      <Feedback error={error} />
      {players && <ul className="registration-player-matches" aria-label={t('Suchergebnisse')}>
        {players.filter((player) => !excludedIds.includes(player.id)).map((player) => <li key={player.id}>
          <Button variant="secondary" disabled={busy} onClick={() => request('details', { userId: player.id, proof: player.proof })}>
            <span data-i18n-skip>{player.firstName} {player.lastName}{player.username ? ` (@${player.username})` : ''}{player.club ? ` · ${player.club}` : ''}</span>
          </Button>
        </li>)}
      </ul>}
      {players && !players.some((player) => !excludedIds.includes(player.id)) && <p role="status">{t('Keine Spieler gefunden.')}</p>}
      {players?.length === 20 && <p className="hint">{t('Bitte die Suche eingrenzen, um weitere Spieler zu finden.')}</p>}
    </>}
  </div>;
}
