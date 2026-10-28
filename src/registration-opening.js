import { registrationOpenStatus } from './worker-core.js';
import { registrationClosesAtUtcIso } from './worker.js';

export const REGISTRATION_OPENED_EVENT = 'tournament_registration_opened';
export const OPENING_MESSAGES = {
  de: '{{name}}: Die Anmeldung ist jetzt geöffnet.',
  nl: '{{name}}: De inschrijving is nu geopend.',
  en: '{{name}}: Registration is now open.',
  es: '{{name}}: La inscripción ya está abierta.',
  fr: '{{name}} : Les inscriptions sont maintenant ouvertes.',
  it: '{{name}}: le iscrizioni sono ora aperte.',
};

// The stored gate is released together with the one-shot subscriptions and their
// postbox messages. A persistent outbox retains pushes if queue submission fails.
export async function releaseRegistrationOpenings(env, now = new Date()) {
  const timestamp = now.toISOString();
  const { results: due } = await env.DB.prepare(`SELECT * FROM tournaments WHERE registration_opening_pending = 1
    AND (registration_opens_at IS NULL OR registration_opens_at <= ?) ORDER BY registration_opens_at LIMIT 20`).bind(timestamp).all();
  // Keep each alarm below D1 Free's query/parameter limits. The next due
  // timestamp schedules an immediate continuation if more work remains.
  if (due.length) {
    const eligible = due.filter((row) => registrationOpenStatus({ ...row, registration_opening_pending: 0 }, now, registrationClosesAtUtcIso(row)) === 'open');
    // Guard the snapshot's start date/time as well as the current opening state.
    const eligibility = eligible.length ? eligible.map(() => '(t.id = ? AND t.date IS ? AND t.start_time IS ? AND t.timezone IS ?)').join(' OR ') : '0';
    const eligibilityBinds = eligible.flatMap((row) => [row.id, row.date, row.start_time, row.timezone]);
    const snapshots = due.map(() => '(id = ? AND date IS ? AND start_time IS ? AND timezone IS ?)').join(' OR ');
    const snapshotBinds = due.flatMap((row) => [row.id, row.date, row.start_time, row.timezone]);
    const eventId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`UPDATE tournaments SET registration_opening_pending = 0, registration_opening_event_id = ?, updated_at = ?
      WHERE (${snapshots}) AND registration_opening_pending = 1
          AND (registration_opens_at IS NULL OR registration_opens_at <= ?)`)
        .bind(eventId, timestamp, ...snapshotBinds, timestamp),
      env.DB.prepare(`INSERT OR IGNORE INTO postbox_messages (id, recipient_id, kind, event_type, event_data, created_at)
        SELECT s.id, s.user_id, 'system', ?, json_object('tournamentId', t.id, 'tournamentName', t.name), ?
        FROM registration_opening_subscriptions s JOIN tournaments t ON t.id = s.tournament_id JOIN users u ON u.id = s.user_id
        WHERE t.registration_opening_event_id = ? AND t.status = 'registration' AND t.visibility = 'public'
          AND t.registration_enabled = 1 AND t.registration_closed = 0
          AND (t.registration_deadline IS NULL OR t.registration_deadline >= ?)
          AND (${eligibility})`)
        .bind(REGISTRATION_OPENED_EVENT, timestamp, eventId, timestamp, ...eligibilityBinds),
      env.DB.prepare(`INSERT OR IGNORE INTO registration_opening_push_outbox (id, user_id, tournament_id, tournament_name, language)
        SELECT s.id, s.user_id, t.id, t.name, COALESCE(u.language, 'de')
        FROM registration_opening_subscriptions s JOIN tournaments t ON t.id = s.tournament_id JOIN users u ON u.id = s.user_id
        JOIN postbox_messages p ON p.id = s.id WHERE t.registration_opening_event_id = ?
          AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = s.user_id
            AND (ps.expiration_time IS NULL OR CAST(ps.expiration_time AS REAL) > ?))`)
        .bind(eventId, now.getTime()),
      env.DB.prepare(`DELETE FROM postbox_messages WHERE recipient_id IN (
        SELECT s.user_id FROM registration_opening_subscriptions s JOIN tournaments t ON t.id = s.tournament_id
        WHERE t.registration_opening_event_id = ?
      ) AND id NOT IN (SELECT recent.id FROM postbox_messages recent
        WHERE recent.recipient_id = postbox_messages.recipient_id ORDER BY created_at DESC, id DESC LIMIT 25)`)
        .bind(eventId),
      env.DB.prepare(`DELETE FROM registration_opening_subscriptions WHERE tournament_id IN
        (SELECT id FROM tournaments WHERE registration_opening_event_id = ?)`)
        .bind(eventId),
      env.DB.prepare(`INSERT INTO audit_log (id, tournament_id, actor_role, action, target, details_json, created_at)
        SELECT ? || ':' || id, id, 'system', 'registration_opened', 'tournament',
          json_object('automatic', 1, 'registrationOpensAt', registration_opens_at), ? FROM tournaments
        WHERE registration_opening_event_id = ? AND status = 'registration' AND visibility = 'public'
          AND registration_enabled = 1 AND registration_closed = 0`)
        .bind(eventId, timestamp, eventId),
    ]);
  }
  await dispatchOpeningPushes(env);
}

export async function dispatchOpeningPushes(env) {
  const { results } = await env.DB.prepare(`SELECT o.* FROM registration_opening_push_outbox o
    WHERE queued = 0 ORDER BY id LIMIT 100`).all();
  if (!results.length) return;
  await env.MAIL_QUEUE.sendBatch(results.map((row) => ({ body: {
    kind: 'push', userId: row.user_id,
      payload: { title: row.tournament_name, messageId: row.id, eventType: REGISTRATION_OPENED_EVENT, tournamentId: row.tournament_id,
        url: `https://ptmonline.org/turniere/${encodeURIComponent(row.tournament_id)}/anmelden`,
      body: (OPENING_MESSAGES[row.language] || OPENING_MESSAGES.de).replace('{{name}}', row.tournament_name) },
  } })));
  await env.DB.prepare(`DELETE FROM registration_opening_push_outbox WHERE id IN (${results.map(() => '?').join(',')})`)
    .bind(...results.map((row) => row.id)).run();
}

// SQLite-backed DO; deliberately no cloudflare:workers import so D1/Worker
// tests can exercise the real alarm handler in Node as well.
export class RegistrationOpeningScheduler {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async schedule() {
    const row = await this.env.DB.prepare(`SELECT registration_opens_at FROM tournaments
      WHERE registration_opening_pending = 1 ORDER BY registration_opens_at LIMIT 1`).first();
    const outbox = await this.env.DB.prepare('SELECT id FROM registration_opening_push_outbox WHERE queued = 0 LIMIT 1').first();
    const time = outbox ? Date.now() + 1000 : row ? Math.max(Date.now() + 1, new Date(row.registration_opens_at || 0).getTime()) : null;
    const current = await this.ctx.storage.getAlarm();
    if (time === null && current !== null) await this.ctx.storage.deleteAlarm();
    else if (time !== null && current !== time) await this.ctx.storage.setAlarm(time);
    await this.env.DB.prepare('UPDATE registration_opening_schedule_changes SET dirty = 0 WHERE id = 1 AND dirty != 0').run();
  }

  async fetch() {
    await this.ctx.blockConcurrencyWhile(() => this.schedule());
    return new Response(null, { status: 204 });
  }

  async alarm() {
    try {
      await releaseRegistrationOpenings(this.env);
      await this.schedule();
      if (await this.ctx.storage.get('retryCount')) await this.ctx.storage.delete('retryCount');
    } catch (error) {
      // Error recovery only: never poll opening dates at a regular interval.
      const attempts = Number(await this.ctx.storage.get('retryCount') || 0);
      await this.ctx.storage.put('retryCount', attempts + 1);
      await this.ctx.storage.setAlarm(Date.now() + Math.min(30_000 * 2 ** attempts, 900_000));
      console.error('Registration opening alarm will retry', error);
    }
  }
}

export async function synchronizeOpeningSchedule(env) {
  if (!env.REGISTRATION_OPENING_SCHEDULER) return;
  const stub = env.REGISTRATION_OPENING_SCHEDULER.get(env.REGISTRATION_OPENING_SCHEDULER.idFromName('registration-openings'));
  const response = await stub.fetch('https://scheduler/sync', { method: 'POST' });
  if (!response.ok) throw new Error('Registration opening scheduling failed');
}
