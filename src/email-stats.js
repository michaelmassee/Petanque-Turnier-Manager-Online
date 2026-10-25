// Eine atomare Schreibanweisung pro erfolgreichem Versand, ohne vorherige Leseabfrage.
export async function recordEmailSent(db, provider, now = new Date()) {
  const strato = provider === 'strato' ? 1 : 0;
  const resend = provider === 'resend' ? 1 : 0;
  if (!strato && !resend) throw new Error('Unknown email provider');
  await db.prepare(`INSERT INTO email_delivery_daily (day, strato, resend) VALUES (?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET strato = strato + excluded.strato, resend = resend + excluded.resend`)
    .bind(now.toISOString().slice(0, 10), strato, resend).run();
}

const RANGES = [7, 30, 90, 365];
const DAY_MS = 86400000;
const sum = (days) => {
  const strato = days.reduce((total, day) => total + day.strato, 0);
  const resend = days.reduce((total, day) => total + day.resend, 0);
  return { strato, resend, total: strato + resend };
};

export async function collectEmailStats(db, requestedDays, now = new Date()) {
  const range = RANGES.includes(requestedDays) ? requestedDays : 30;
  const today = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (range - 1) * DAY_MS).toISOString().slice(0, 10);
  const [daily, summary] = await db.batch([
    db.prepare('SELECT day, strato, resend FROM email_delivery_daily WHERE day >= ? AND day <= ? ORDER BY day').bind(from, today),
    db.prepare(`SELECT started_at,
      COALESCE(SUM(strato), 0) AS strato, COALESCE(SUM(resend), 0) AS resend
      FROM email_delivery_tracking LEFT JOIN email_delivery_daily ON day <= ?
      WHERE id = 1 GROUP BY id`).bind(today),
  ]);
  const byDay = new Map(daily.results.map((row) => [row.day, row]));
  const days = Array.from({ length: range }, (_, index) => {
    const day = new Date(Date.parse(`${from}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10);
    const counts = byDay.get(day);
    const strato = Number(counts?.strato || 0);
    const resend = Number(counts?.resend || 0);
    return { day, strato, resend, total: strato + resend };
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
      allTime: sum([{ strato: Number(allTime.strato), resend: Number(allTime.resend) }]),
    },
  };
}
