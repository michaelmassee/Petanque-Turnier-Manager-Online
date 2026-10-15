import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authenticatedApi } from '../lib/api.js';
import { Button, Feedback } from '../components/ui.jsx';
import { DISPLAY_LOCALES, formatDate } from '../lib/format.js';

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

const USAGE_RANGES = [7, 14, 30];
const USAGE_METRICS = [
  { key: 'rowsRead', label: 'D1 gelesene Zeilen' },
  { key: 'rowsWritten', label: 'D1 geschriebene Zeilen' },
  { key: 'requests', label: 'Worker-Requests' },
];
const USAGE_CHART_PADDING = { ...CHART_PADDING, left: 52 };

function numberFormatter(language, options) {
  return new Intl.NumberFormat(DISPLAY_LOCALES[language] || DISPLAY_LOCALES.de, options);
}

function usageTone(value, limit) {
  if (!limit) return '';
  if (value >= limit) return ' is-over';
  return value >= limit * 0.8 ? ' is-warn' : '';
}

// Einfaches Säulendiagramm für eine Kennzahl. Das Tageslimit wird als Linie gezeigt, sobald der Verbrauch
// mindestens die Hälfte davon erreicht; sonst würde die Linie alle Säulen auf wenige Pixel stauchen.
function UsageChart({ bars, limit, labelFor, labelIndexes, language, activeIndex, onActivate, onSelect, ariaLabel }) {
  const containerRef = useRef(null);
  const chartWidth = useElementWidth(containerRef, CHART_DEFAULT_WIDTH);
  const padding = USAGE_CHART_PADDING;
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = CHART_HEIGHT - padding.top - padding.bottom;
  const dataMax = Math.max(...bars.map((bar) => bar.value), 0);
  const showLimit = Boolean(limit) && dataMax >= limit / 2;
  const maxValue = niceMax(showLimit ? Math.max(dataMax, limit) : dataMax);
  const slot = plotWidth / bars.length;
  const barWidth = Math.max(slot - 2, 1);
  const baseline = padding.top + plotHeight;
  const yFor = (value) => baseline - (value / maxValue) * plotHeight;
  const compact = numberFormatter(language, { notation: 'compact', maximumFractionDigits: 1 });

  return (
    <div ref={containerRef}>
      <svg className="visitor-chart" viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img" aria-label={ariaLabel} onMouseLeave={() => onActivate(null)}>
        {[0, maxValue / 2, maxValue].map((tick) => (
          <g key={tick}>
            <line className="visitor-chart-grid" x1={padding.left} x2={chartWidth - padding.right} y1={yFor(tick)} y2={yFor(tick)} />
            <text className="visitor-chart-axis" x={padding.left - 6} y={yFor(tick)} textAnchor="end" dominantBaseline="middle">{compact.format(tick)}</text>
          </g>
        ))}
        {bars.map((bar, index) => {
          const x = padding.left + index * slot + (slot - barWidth) / 2;
          const height = (bar.value / maxValue) * plotHeight;
          return (
            <g key={bar.key} className={activeIndex === index ? 'visitor-chart-bar is-active' : 'visitor-chart-bar'}>
              {bar.value > 0 && <path className={`usage-chart-bar${usageTone(bar.value, limit)}`} d={barPath(x, baseline - height, barWidth, height, barWidth >= 6 ? 4 : 1)} />}
              <rect className="visitor-chart-hit" x={padding.left + index * slot} y={padding.top} width={slot} height={plotHeight}
                onMouseEnter={() => onActivate(index)} onClick={() => { onActivate(index); onSelect?.(index); }} />
            </g>
          );
        })}
        {showLimit && <line className="usage-chart-limit" x1={padding.left} x2={chartWidth - padding.right} y1={yFor(limit)} y2={yFor(limit)} />}
        {labelIndexes.map((index) => (
          <text key={index} className="visitor-chart-axis" x={padding.left + index * slot + slot / 2} y={CHART_HEIGHT - 6}
            textAnchor={index === 0 ? 'start' : index === bars.length - 1 ? 'end' : 'middle'}>
            {labelFor(index)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// Lange SQL-Texte zunächst auf drei Zeilen gekürzt; Antippen klappt die ganze Abfrage auf.
function UsageQuery({ query }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <button type="button" className={expanded ? 'usage-query is-expanded' : 'usage-query'} aria-expanded={expanded}
      title={expanded ? t('Abfrage einklappen') : t('Ganze Abfrage anzeigen')} onClick={() => setExpanded(!expanded)}>
      <code data-i18n-skip>{query}</code>
    </button>
  );
}

function UsageDayDetail({ date, metric, language }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeHour, setActiveHour] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    authenticatedApi(`/api/admin/cloudflare-usage?date=${encodeURIComponent(date)}`)
      .then((result) => { if (!cancelled) { setDetail(result); setActiveHour(null); } })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const number = numberFormatter(language);
  const metricLabel = t(USAGE_METRICS.find((entry) => entry.key === metric).label);
  const hours = detail?.date === date ? detail.hours : [];
  const shownHour = activeHour === null ? null : hours[activeHour];
  const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <div className="usage-day" aria-busy={loading}>
      <h3>{t('Verlauf am {{date}} (UTC)', { date: formatDate(date, language) })}</h3>
      <Feedback error={error} />
      {loading && !hours.length && <p className="muted">{t('Lädt …')}</p>}
      {hours.length > 0 && (
        <>
          <p className="visitor-readout" aria-live="polite">
            {shownHour
              ? <><strong>{hourLabel(shownHour.hour)}–{hourLabel((shownHour.hour + 1) % 24)}</strong> {metricLabel}: {number.format(shownHour[metric])}</>
              : t('{{metric}} pro Stunde', { metric: metricLabel })}
          </p>
          <UsageChart bars={hours.map((entry) => ({ key: entry.hour, value: entry[metric] }))}
            labelFor={(index) => hourLabel(hours[index].hour)} labelIndexes={[0, 6, 12, 18, 23]} language={language}
            activeIndex={activeHour} onActivate={setActiveHour} ariaLabel={t('{{metric}} pro Stunde', { metric: metricLabel })} />
          <h3>{t('Teuerste D1-Abfragen')}</h3>
          {detail.topQueries.length === 0 && <p className="muted">{t('Keine Abfragen an diesem Tag.')}</p>}
          <ol className="usage-queries">
            {detail.topQueries.map((entry) => (
              <li key={entry.query}>
                <span className="usage-query-stats">
                  {t('{{rows}} Zeilen gelesen · {{count}} Aufrufe · {{perCall}} je Aufruf', {
                    rows: number.format(entry.rowsRead),
                    count: number.format(entry.count),
                    perCall: number.format(entry.count ? Math.round(entry.rowsRead / entry.count) : 0),
                  })}
                </span>
                <UsageQuery query={entry.query} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/** Cloudflare-Verbrauch gegenüber den Tageslimits des Free-Plans, mit Tagesverlauf und Details je Tag. */
export function CloudflareUsagePanel() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [range, setRange] = useState(USAGE_RANGES[0]);
  const [metric, setMetric] = useState(USAGE_METRICS[0].key);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    authenticatedApi(`/api/admin/cloudflare-usage?days=${range}`)
      .then((result) => { if (!cancelled) { setUsage(result); setActiveIndex(null); } })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const days = usage?.days || [];
  // Standardmäßig der letzte vollständige Tag (gestern), weil der heutige noch läuft.
  const detailDay = selectedDay && days.some((entry) => entry.day === selectedDay) ? selectedDay : days.at(-2)?.day || days.at(-1)?.day;
  const shownDay = days[activeIndex ?? days.findIndex((entry) => entry.day === detailDay)];
  const number = numberFormatter(language);
  const percent = numberFormatter(language, { style: 'percent', maximumFractionDigits: 1 });
  const metricLabel = (key) => t(USAGE_METRICS.find((entry) => entry.key === key).label);
  const peakOf = (key) => days.reduce((best, entry) => (entry[key] > (best?.[key] ?? -1) ? entry : best), null);

  return (
    <div className="panel">
      <div className="section-title">
        <div>
          <h2>{t('Cloudflare-Auslastung')}</h2>
          <p className="muted">{t('Verbrauch gegenüber den Tageslimits des Cloudflare-Free-Plans. Tage in UTC, die Limits gelten bis 00:00 UTC. Werte können einige Minuten verzögert sein.')}</p>
        </div>
        {usage?.configured !== false && (
          <div className="visitor-range" role="group" aria-label={t('Zeitraum')}>
            {USAGE_RANGES.map((days) => (
              <Button key={days} variant={range === days ? 'primary' : 'secondary'} aria-pressed={range === days}
                loading={loading && range === days} onClick={() => setRange(days)}>
                {t('{{count}} Tage', { count: days })}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Feedback error={error} />
      {usage?.configured === false && (
        <p className="hint">{t('Nicht eingerichtet: Der Worker braucht die Secrets CF_ANALYTICS_API_TOKEN (Recht „Account Analytics: Read“) und CF_ACCOUNT_ID.')}</p>
      )}
      {days.length > 0 && (
        <div aria-busy={loading}>
          <div className="visitor-totals usage-totals">
            {USAGE_METRICS.map(({ key }) => {
              const today = days.at(-1)[key];
              const peak = peakOf(key);
              return (
                <div key={key} className={`visitor-total usage-total${usageTone(today, usage.limits[key])}`}>
                  <span className="visitor-total-label">{metricLabel(key)} · {t('Heute')}</span>
                  <strong>{number.format(today)}</strong>
                  <span className="visitor-total-split">
                    {t('{{percent}} von {{limit}}', { percent: percent.format(today / usage.limits[key]), limit: number.format(usage.limits[key]) })}
                  </span>
                  <span className="visitor-total-split">
                    {t('Höchstwert {{value}} am {{date}}', { value: number.format(peak[key]), date: formatDate(peak.day, language) })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="visitor-range usage-metrics" role="group" aria-label={t('Kennzahl')}>
            {USAGE_METRICS.map(({ key }) => (
              <Button key={key} variant={metric === key ? 'primary' : 'secondary'} aria-pressed={metric === key} onClick={() => setMetric(key)}>
                {metricLabel(key)}
              </Button>
            ))}
          </div>
          {shownDay && (
            <p className="visitor-readout" aria-live="polite">
              <strong>{formatDate(shownDay.day, language)}</strong>
              {' '}
              {USAGE_METRICS.map(({ key }) => `${metricLabel(key)}: ${number.format(shownDay[key])} (${percent.format(shownDay[key] / usage.limits[key])})`).join(' · ')}
            </p>
          )}
          <UsageChart bars={days.map((entry) => ({ key: entry.day, value: entry[metric] }))} limit={usage.limits[metric]}
            labelFor={(index) => formatDate(days[index].day, language)}
            labelIndexes={[...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])]} language={language}
            activeIndex={activeIndex} onActivate={setActiveIndex} onSelect={(index) => setSelectedDay(days[index].day)}
            ariaLabel={t('{{metric}} pro Tag', { metric: metricLabel(metric) })} />
          <p className="muted usage-hint">{t('Einen Tag antippen, um Stundenverlauf und teuerste Abfragen zu sehen.')}</p>
          <details className="visitor-table">
            <summary>{t('Als Tabelle anzeigen')}</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>{t('Tag')}</th>{USAGE_METRICS.map(({ key }) => <th key={key}>{metricLabel(key)}</th>)}</tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((entry) => (
                    <tr key={entry.day}>
                      <td>{formatDate(entry.day, language)}</td>
                      {USAGE_METRICS.map(({ key }) => (
                        <td key={key} className={usageTone(entry[key], usage.limits[key]).trim()}>{number.format(entry[key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {detailDay && <UsageDayDetail date={detailDay} metric={metric} language={language} />}
        </div>
      )}
    </div>
  );
}

// Wie bei den Besuchern: bei 365 Tagen je 7 Tage zu einer Säule; Neue werden summiert, der Gesamtstand gilt am Wochenende.
function groupGrowthDays(days, range) {
  if (range < 365) return days.map((entry) => ({ ...entry, from: entry.day, to: entry.day }));
  const groups = [];
  for (let index = days.length % 7; index < days.length; index += 7) {
    const week = days.slice(index, index + 7);
    groups.push({ from: week[0].day, to: week.at(-1).day, added: week.reduce((sum, entry) => sum + entry.added, 0), total: week.at(-1).total });
  }
  return groups;
}

/** Bestand und Zuwachs (Benutzer oder Turniere) mit Verlauf pro Tag. */
export function GrowthStatsPanel({ kind, title, description, totalLabel }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [range, setRange] = useState(VISITOR_RANGES[0]);
  const [metric, setMetric] = useState('total');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    authenticatedApi(`/api/admin/growth-stats?kind=${kind}&days=${range}`)
      .then((result) => { if (!cancelled) { setStats(result); setActiveIndex(null); } })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, range]);

  const bars = useMemo(() => (stats ? groupGrowthDays(stats.days, stats.range) : []), [stats]);
  const shownBar = bars[activeIndex ?? bars.length - 1];
  const metrics = [{ key: 'total', label: totalLabel }, { key: 'added', label: t('Neu') }];
  const barLabel = (bar) => (bar.from === bar.to
    ? formatDate(bar.from, language)
    : `${formatDate(bar.from, language)} – ${formatDate(bar.to, language)}`);
  const labelIndexes = [...new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1])];

  return (
    <div className="panel">
      <div className="section-title">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
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
            <div className="visitor-total">
              <span className="visitor-total-label">{totalLabel}</span>
              <strong>{stats.totals.total}</strong>
              {stats.totals.since && (
                <span className="visitor-total-split">{t('seit {{date}}', { date: formatDate(stats.totals.since, language) })}</span>
              )}
            </div>
            <div className="visitor-total">
              <span className="visitor-total-label">{t('Neu heute')}</span>
              <strong>{stats.totals.today}</strong>
            </div>
            <div className="visitor-total">
              <span className="visitor-total-label">{t('Neu in den letzten {{count}} Tagen', { count: stats.range })}</span>
              <strong>{stats.totals.range}</strong>
            </div>
          </div>
          <div className="visitor-range usage-metrics" role="group" aria-label={t('Kennzahl')}>
            {metrics.map(({ key, label }) => (
              <Button key={key} variant={metric === key ? 'primary' : 'secondary'} aria-pressed={metric === key} onClick={() => setMetric(key)}>
                {label}
              </Button>
            ))}
          </div>
          {shownBar && (
            <p className="visitor-readout" aria-live="polite">
              <strong>{barLabel(shownBar)}</strong>
              {' '}
              {t('{{added}} neu · {{total}} insgesamt', { added: shownBar.added, total: shownBar.total })}
            </p>
          )}
          <UsageChart bars={bars.map((bar) => ({ key: bar.from, value: bar[metric] }))}
            labelFor={(index) => formatDate(bars[index].from, language)} labelIndexes={labelIndexes} language={language}
            activeIndex={activeIndex} onActivate={setActiveIndex}
            ariaLabel={`${title}: ${metrics.find((entry) => entry.key === metric).label}`} />
          <details className="visitor-table">
            <summary>{t('Als Tabelle anzeigen')}</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>{stats.range < 365 ? t('Tag') : t('Woche')}</th><th>{t('Neu')}</th><th>{totalLabel}</th></tr>
                </thead>
                <tbody>
                  {[...bars].reverse().map((bar) => (
                    <tr key={bar.from}><td>{barLabel(bar)}</td><td>{bar.added}</td><td>{bar.total}</td></tr>
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
      <GrowthStatsPanel kind="users" title={t('Registrierte Benutzer')} totalLabel={t('Registriert')}
        description={t('Benutzerkonten und Neuregistrierungen pro Tag (UTC). Gelöschte Konten fehlen im Verlauf.')} />
      <GrowthStatsPanel kind="tournaments" title={t('Turniere')} totalLabel={t('Turniere')}
        description={t('Angelegte Turniere ohne Kalendereinträge, pro Tag (UTC). Gelöschte Turniere fehlen im Verlauf.')} />
      <CloudflareUsagePanel />
      <DataRetentionPanel />
    </section>
  );
}

export default AdminDashboardPage;
