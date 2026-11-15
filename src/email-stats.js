// Plattform-Gateways (Strato, Resend) und eigene Gateways der Turnierleitungen (organizer) getrennt zählen.
const PROVIDERS = ['strato', 'resend', 'organizer'];

// Eine atomare Schreibanweisung pro erfolgreichem Versand, ohne vorherige Leseabfrage.
export async function recordEmailSent(db, provider, now = new Date()) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unknown email provider');
  await db.prepare(`INSERT INTO email_delivery_daily (day, strato, resend, organizer) VALUES (?, ?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET strato = strato + excluded.strato, resend = resend + excluded.resend,
      organizer = organizer + excluded.organizer`)
    .bind(now.toISOString().slice(0, 10), ...PROVIDERS.map((entry) => (entry === provider ? 1 : 0))).run();
}

const RANGES = [7, 30, 90, 365];
const DAY_MS = 86400000;

function counts(row) {
  const result = Object.fromEntries(PROVIDERS.map((provider) => [provider, Number(row?.[provider] || 0)]));
  return { ...result, total: PROVIDERS.reduce((total, provider) => total + result[provider], 0) };
}

const sum = (days) => counts(Object.fromEntries(PROVIDERS.map((provider) => [provider, days.reduce((total, day) => total + day[provider], 0)])));

export async function collectEmailStats(db, requestedDays, now = new Date()) {
  const range = RANGES.includes(requestedDays) ? requestedDays : 30;
  const today = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (range - 1) * DAY_MS).toISOString().slice(0, 10);
  const [daily, summary] = await db.batch([
    db.prepare('SELECT day, strato, resend, organizer FROM email_delivery_daily WHERE day >= ? AND day <= ? ORDER BY day').bind(from, today),
    db.prepare(`SELECT started_at,
      COALESCE(SUM(strato), 0) AS strato, COALESCE(SUM(resend), 0) AS resend, COALESCE(SUM(organizer), 0) AS organizer
      FROM email_delivery_tracking LEFT JOIN email_delivery_daily ON day <= ?
      WHERE id = 1 GROUP BY id`).bind(today),
  ]);
  const byDay = new Map(daily.results.map((row) => [row.day, row]));
  const days = Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.parse(`${from}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10);
    return { day, ...counts(byDay.get(day)) };
  });
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  const weekFrom = weekStart.toISOString().slice(0, 10);
  const allTime = summary.results[0];
  return {
    range,
    today,
    trackingSince: allTime.started_at,
    days,
    totals: {
      today: sum(days.slice(-1)),
      week: sum(days.filter((day) => day.day >= weekFrom)),
      range: sum(days),
      allTime: counts(allTime),
    },
  };
}
