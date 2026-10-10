import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, Feedback } from '../components/ui.jsx';
import { formatDate } from '../lib/format.js';

/**
 * Automatische Löschung personenbezogener Daten (DS-04): standardmäßig aus. Zeigt vor dem Einschalten, wie viele
 * beendete Turniere ein Löschlauf jetzt bereinigen würde.
 */
export function DataRetentionPanel() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    authenticatedApi('/api/admin/settings/data-retention')
      .then((result) => {
        if (cancelled) return;
        setSettings(result);
        setEnabled(result.automaticPurgeEnabled);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await authenticatedApi('/api/admin/settings/data-retention', {
        method: 'PUT',
        body: JSON.stringify({ automaticPurgeEnabled: enabled }),
      });
      setSettings(result);
      setEnabled(result.automaticPurgeEnabled);
      setMessage(t('Einstellung gespeichert.'));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="section-title">
        <div>
          <h2>{t('Datenschutz')}</h2>
          <p className="muted">{t('Personenbezogene Daten beendeter Turniere nach Ablauf der Aufbewahrungsfrist automatisch löschen (E-Mail-Adressen, Tarife, Antworten, Nachrichten; das Protokoll wird pseudonymisiert).')}</p>
        </div>
      </div>
      <Feedback error={error} />
      <Feedback message={message} />
      {settings && (
        <>
          <p className="hint">{t('Ein Löschlauf würde jetzt {{count}} beendete Turniere bereinigen. Das lässt sich nicht rückgängig machen.', { count: settings.dueTournaments })}</p>
          <label className="checkbox-field">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={busy} />
            {t('Automatische Löschung einschalten (täglich)')}
          </label>
          <Button disabled={busy || enabled === settings.automaticPurgeEnabled} loading={busy} onClick={save}>{t('Speichern')}</Button>
        </>
      )}
    </div>
  );
}

const VISITOR_RANGES = [30, 90, 365];
const CHART_DEFAULT_WIDTH = 720;
const CHART_HEIGHT = 200;
const CHART_PADDING = { top: 12, right: 8, bottom: 24, left: 36 };

// Ein Jahr Tagessäulen wäre zu schmal: bei 365 Tagen je 7 Tage zu einer Säule zusammenfassen.
function groupVisitorDays(days, range) {
  if (range < 365) return days.map((entry) => ({ ...entry, from: entry.day, to: entry.day }));
  const groups = [];
  for (let index = days.length % 7; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    groups.push({
      from: week[0].day,
      to: week.at(-1).day,
      users: week.reduce((sum, entry) => sum + entry.users, 0),
      guests: week.reduce((sum, entry) => sum + entry.guests, 0),
    });
  }
  return groups;
}

function niceMax(value) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= value / 4) * magnitude;
  return Math.ceil(value / step) * step;
}

// Säule mit abgerundetem oberem Ende, unten bündig an der Grundlinie bzw. am darunterliegenden Segment.
function barPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

// Breite des Containers in Pixeln, damit das SVG 1:1 rendert und Achsenschrift auf Handy und Desktop gleich groß bleibt.
function useElementWidth(ref, fallback) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function VisitorChart({ bars, language, activeIndex, onActivate }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const chartWidth = useElementWidth(containerRef, CHART_DEFAULT_WIDTH);
  const plotWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxValue = niceMax(Math.max(...bars.map((bar) => bar.users + bar.guests), 0));
  const slot = plotWidth / bars.length;
  const barWidth = Math.max(slot - 2, 1);
  const yFor = (value) => CHART_PADDING.top + plotHeight - (value / maxValue) * plotHeight;
  const ticks = [0, maxValue / 2, maxValue];
  const labelIndexes = [...new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1])];

  return (
    <div ref={containerRef}>
      <svg className="visitor-chart" viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img"
        aria-label={t('Besucher pro Tag, angemeldete Nutzer und Gäste gestapelt')} onMouseLeave={() => onActivate(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="visitor-chart-grid" x1={CHART_PADDING.left} x2={chartWidth - CHART_PADDING.right} y1={yFor(tick)} y2={yFor(tick)} />
            <text className="visitor-chart-axis" x={CHART_PADDING.left - 6} y={yFor(tick)} textAnchor="end" dominantBaseline="middle">{tick}</text>
          </g>
        ))}
        {bars.map((bar, index) => {
          const x = CHART_PADDING.left + index * slot + (slot - barWidth) / 2;
          const userHeight = (bar.users / maxValue) * plotHeight;
          const guestHeight = (bar.guests / maxValue) * plotHeight;
          const baseline = CHART_PADDING.top + plotHeight;
          // 2px Abstand zwischen den Segmenten, sofern beide vorhanden sind.
          const gap = bar.users && bar.guests ? 2 : 0;
          const radius = barWidth >= 6 ? 4 : 1;
          return (
            <g key={bar.from} className={activeIndex === index ? 'visitor-chart-bar is-active' : 'visitor-chart-bar'}>
              {bar.users > 0 && (
                <path className="visitor-chart-users" d={bar.guests ? `M${x},${baseline}V${baseline - userHeight}H${x + barWidth}V${baseline}Z` : barPath(x, baseline - userHeight, barWidth, userHeight, radius)} />
              )}
              {bar.guests > 0 && (
                <path className="visitor-chart-guests" d={barPath(x, baseline - userHeight - gap - guestHeight, barWidth, guestHeight, radius)} />
              )}
              <rect className="visitor-chart-hit" x={CHART_PADDING.left + index * slot} y={CHART_PADDING.top} width={slot} height={plotHeight}
                onMouseEnter={() => onActivate(index)} onClick={() => onActivate(index)} />
            </g>
          );
        })}
        {labelIndexes.map((index) => (
          <text key={index} className="visitor-chart-axis" x={CHART_PADDING.left + index * slot + slot / 2} y={CHART_HEIGHT - 6}
            textAnchor={index === 0 ? 'start' : index === bars.length - 1 ? 'end' : 'middle'}>
            {formatDate(bars[index].from, language)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function VisitorTotal({ label, totals }) {
  const { t } = useTranslation();
  return (
    <div className="visitor-total">
      <span className="visitor-total-label">{label}</span>
      <strong>{totals.total}</strong>
      <span className="visitor-total-split">
        {t('{{users}} Nutzer · {{guests}} Gäste', { users: totals.users, guests: totals.guests })}
      </span>
    </div>
  );
}

/** Eindeutige Besucher pro Tag, getrennt nach angemeldeten Nutzern und Gästen, mit Summen und Verlauf. */
export function VisitorStatsPanel() {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState(VISITOR_RANGES[0]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    authenticatedApi(`/api/admin/visitor-stats?days=${range}`)
      .then((result) => { if (!cancelled) { setStats(result); setActiveIndex(null); } })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const bars = useMemo(() => (stats ? groupVisitorDays(stats.days, stats.range) : []), [stats]);
  const shownBar = bars[activeIndex ?? bars.length - 1];
  const rangeLabel = (days) => t('Letzte {{count}} Tage', { count: days });
  const barLabel = (bar) => (bar.from === bar.to
    ? formatDate(bar.from, i18n.language)
    : `${formatDate(bar.from, i18n.language)} – ${formatDate(bar.to, i18n.language)}`);

  return (
    <div className="panel">
      <div className="section-title">
        <div>
          <h2>{t('Besucher')}</h2>
          <p className="muted">{t('Eindeutige Besucher pro Tag. Wer sich im Lauf eines Tages anmeldet, zählt einmal als Gast und einmal als Nutzer.')}</p>
        </div>
        <div className="visitor-range" role="group" aria-label={t('Zeitraum')}>
          {VISITOR_RANGES.map((days) => (
            <Button key={days} variant={range === days ? 'primary' : 'secondary'} aria-pressed={range === days}
              loading={loading && range === days} onClick={() => setRange(days)}>
              {t('{{count}} Tage', { count: days })}
            </Button>
          ))}
        </div>
      </div>
      <Feedback error={error} />
      {stats && (
        <div aria-busy={loading}>
          <div className="visitor-totals">
            <VisitorTotal label={t('Heute')} totals={stats.totals.today} />
            <VisitorTotal label={rangeLabel(stats.range)} totals={stats.totals.range} />
            <VisitorTotal
              label={stats.totals.allTime.since
                ? t('Gesamt seit {{date}}', { date: formatDate(stats.totals.allTime.since, i18n.language) })
                : t('Gesamt')}
              totals={stats.totals.allTime}
            />
          </div>
          <div className="visitor-legend">
            <span><span className="visitor-swatch visitor-swatch-users" aria-hidden="true" />{t('Angemeldete Nutzer')}</span>
            <span><span className="visitor-swatch visitor-swatch-guests" aria-hidden="true" />{t('Gäste')}</span>
          </div>
          {shownBar && (
            <p className="visitor-readout" aria-live="polite">
              <strong>{barLabel(shownBar)}</strong>
              {' '}
              {t('{{total}} Besucher: {{users}} Nutzer · {{guests}} Gäste', {
                total: shownBar.users + shownBar.guests, users: shownBar.users, guests: shownBar.guests,
              })}
            </p>
          )}
          <VisitorChart bars={bars} language={i18n.language} activeIndex={activeIndex} onActivate={setActiveIndex} />
          <details className="visitor-table">
            <summary>{t('Als Tabelle anzeigen')}</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>{stats.range < 365 ? t('Tag') : t('Woche')}</th><th>{t('Nutzer')}</th><th>{t('Gäste')}</th><th>{t('Summe')}</th></tr>
                </thead>
                <tbody>
                  {[...bars].reverse().map((bar) => (
                    <tr key={bar.from}><td>{barLabel(bar)}</td><td>{bar.users}</td><td>{bar.guests}</td><td>{bar.users + bar.guests}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export function AdminDashboardPage({ onSelectTab, onNavigate, tournamentsCount, registrationsCount }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [pendingPetanqueAktuellImports, setPendingPetanqueAktuellImports] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await authenticatedApi('/api/admin/dashboard-stats');
        if (!cancelled) setStats(result);
        try {
          const candidates = await authenticatedApi('/api/admin/petanque-aktuell/tournaments');
          if (!cancelled) setPendingPetanqueAktuellImports((candidates.tournaments || []).filter((tournament) => !tournament.imported).length);
        } catch {
          if (!cancelled) setPendingPetanqueAktuellImports(undefined);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    {
      key: 'tournaments',
      title: t('Turnierverwaltung'),
      description: t('Alle Turniere im System verwalten, inklusive gemeldeter Turniere'),
      statLabel: t('Turniere'),
      statValue: tournamentsCount,
      onClick: () => onSelectTab('tournaments'),
    },
    {
      key: 'play',
      title: t('Turnier starten'),
      description: t('Ein laufendes Turnier online steuern und Ergebnisse erfassen'),
      statLabel: null,
      statValue: undefined,
      onClick: () => onSelectTab('play'),
    },
    {
      key: 'registrations',
      title: t('Teilnehmer verwalten'),
      description: t('Anmeldungen und Teilnehmer aller Turniere verwalten'),
      statLabel: t('Anmeldungen'),
      statValue: registrationsCount,
      onClick: () => onSelectTab('registrations'),
    },
    {
      key: 'users',
      title: t('Benutzerverwaltung'),
      description: t('Benutzerkonten anlegen, bearbeiten und löschen'),
      statLabel: t('Benutzer'),
      statValue: stats?.users,
      onClick: () => onSelectTab('users'),
    },
    {
      key: 'clubs',
      title: t('Vereine'),
      description: t('Vereine verwalten, einschließlich Anfragen und Berechtigungen.'),
      statLabel: t('Offene Anfragen'),
      statValue: stats?.pendingClubRequests,
      onClick: () => onSelectTab('clubs'),
    },
    {
      key: 'places',
      title: t('Bouleplätze'),
      description: t('Bouleplätze verwalten, einschließlich Freigaben und Meldungen.'),
      statLabel: t('Offene Vorgänge'),
      statValue: stats?.pendingPlaces,
      onClick: () => onSelectTab('places'),
    },
    {
      key: 'apikeys',
      title: t('Alle API-Schlüssel'),
      description: t('API-Schlüssel-Anfragen verwalten'),
      statLabel: t('Offene Anfragen'),
      statValue: stats?.pendingApiKeys,
      onClick: () => onSelectTab('apikeys'),
    },
    {
      key: 'petanque-aktuell-import',
      title: t('Pétanque Aktuell importieren'),
      description: t('Turniere von Pétanque Aktuell importieren'),
      statLabel: t('Noch nicht importiert'),
      statValue: pendingPetanqueAktuellImports,
      onClick: () => onSelectTab('petanque-aktuell-import'),
    },
    {
      key: 'player-listings',
      title: t('Mitspielgesuche moderieren'),
      description: t('Alle Mitspielgesuche einsehen und moderieren'),
      statLabel: t('Aktive Gesuche'),
      statValue: stats?.playerListings,
      onClick: () => onNavigate('/meine-anzeigen'),
    },
  ];

  return (
    <section className="single-column">
      <div className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Admin Dashboard')}</h2>
            <p className="muted">{t('Zentraler Einstieg für alle Admin-Funktionen.')}</p>
          </div>
        </div>
        <Feedback error={error} />
        <div className="admin-dashboard-grid" aria-busy={loading}>
          {cards.map((card) => (
            <button key={card.key} type="button" className="admin-dashboard-card" onClick={card.onClick}>
              <span className="admin-dashboard-card-title">{card.title}</span>
              <span className="admin-dashboard-card-description">{card.description}</span>
              {card.statLabel && (
                <span className="admin-dashboard-card-stat">
                  <strong>{card.statValue === undefined ? '–' : card.statValue}</strong>
                  <span>{card.statLabel}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <VisitorStatsPanel />
      <DataRetentionPanel />
    </section>
  );
}

export default AdminDashboardPage;
