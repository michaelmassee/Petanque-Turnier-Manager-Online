import { registrationOpenStatus } from './worker-core.js';
import { emailAction, registrationClosesAtUtcIso, tournamentMailRoute } from './worker.js';

export const REGISTRATION_OPENED_EVENT = 'tournament_registration_opened';
export const OPENING_MESSAGES = {
  de: '{{name}}: Die Anmeldung ist jetzt geöffnet.',
  nl: '{{name}}: De inschrijving is nu geopend.',
  en: '{{name}}: Registration is now open.',
  es: '{{name}}: La inscripción ya está abierta.',
  fr: '{{name}} : Les inscriptions sont maintenant ouvertes.',
  it: '{{name}}: le iscrizioni sono ora aperte.',
};

// E-Mail an jeden Abonnenten der Glocke (zusätzlich zu Postfach und Push). Ohne Vorname nur die Grußformel.
export const OPENING_EMAILS = {
  de: {
    subject: (name) => `Anmeldung geöffnet: ${name}`,
    text: (firstName, name, link) => `Hallo${firstName ? ` ${firstName}` : ''},\n\ndie Anmeldung für "${name}" ist jetzt geöffnet. Du wolltest daran erinnert werden.\n\nZur Anmeldung:\n${link}`,
  },
  nl: {
    subject: (name) => `Inschrijving geopend: ${name}`,
    text: (firstName, name, link) => `Hallo${firstName ? ` ${firstName}` : ''},\n\nde inschrijving voor "${name}" is nu geopend. Je wilde hieraan herinnerd worden.\n\nNaar de inschrijving:\n${link}`,
  },
  en: {
    subject: (name) => `Registration open: ${name}`,
    text: (firstName, name, link) => `Hi${firstName ? ` ${firstName}` : ''},\n\nregistration for "${name}" is now open. You asked to be reminded.\n\nRegister here:\n${link}`,
  },
  es: {
    subject: (name) => `Inscripción abierta: ${name}`,
    text: (firstName, name, link) => `Hola${firstName ? ` ${firstName}` : ''}:\n\nla inscripción para "${name}" ya está abierta. Pediste que te lo recordáramos.\n\nIr a la inscripción:\n${link}`,
  },
  fr: {
    subject: (name) => `Inscriptions ouvertes : ${name}`,
    text: (firstName, name, link) => `Bonjour${firstName ? ` ${firstName}` : ''},\n\nles inscriptions pour « ${name} » sont maintenant ouvertes. Tu avais demandé à être prévenu(e).\n\nS’inscrire :\n${link}`,
  },
  it: {
    subject: (name) => `Iscrizioni aperte: ${name}`,
    text: (firstName, name, link) => `Ciao${firstName ? ` ${firstName}` : ''},\n\nle iscrizioni a "${name}" sono ora aperte. Avevi chiesto di ricevere un promemoria.\n\nVai all’iscrizione:\n${link}`,
  },
};

function openingRegistrationUrl(tournamentId) {
  return `https://ptmonline.org/turniere/${encodeURIComponent(tournamentId)}/anmelden`;
}

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
      // Mail an jeden Abonnenten mit bestätigter Adresse, unabhängig vom Push-Abo; dieselben Bedingungen wie die
      // Postfach-Nachricht (Join auf postbox_messages).
      env.DB.prepare(`INSERT OR IGNORE INTO registration_opening_mail_outbox (id, user_id, tournament_id, tournament_name, email, first_name, language)
        SELECT s.id, s.user_id, t.id, t.name, u.email, u.first_name, COALESCE(u.language, 'de')
        FROM registration_opening_subscriptions s JOIN tournaments t ON t.id = s.tournament_id JOIN users u ON u.id = s.user_id
        JOIN postbox_messages p ON p.id = s.id WHERE t.registration_opening_event_id = ? AND u.email_verified_at IS NOT NULL`)
        .bind(eventId),
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
  await dispatchOpeningMails(env);
}

export async function dispatchOpeningPushes(env) {
  const { results } = await env.DB.prepare(`SELECT o.* FROM registration_opening_push_outbox o
    WHERE queued = 0 ORDER BY id LIMIT 100`).all();
  if (!results.length) return;
  await env.MAIL_QUEUE.sendBatch(results.map((row) => ({ body: {
    kind: 'push', userId: row.user_id,
      payload: { title: row.tournament_name, messageId: row.id, eventType: REGISTRATION_OPENED_EVENT, tournamentId: row.tournament_id,
        url: openingRegistrationUrl(row.tournament_id),
      body: (OPENING_MESSAGES[row.language] || OPENING_MESSAGES.de).replace('{{name}}', row.tournament_name) },
  } })));
  await env.DB.prepare(`DELETE FROM registration_opening_push_outbox WHERE id IN (${results.map(() => '?').join(',')})`)
    .bind(...results.map((row) => row.id)).run();
}

// Mails laufen wie alle Turnier-Mails über die Route des Veranstalters (Mail-Freigabe bzw. eigenes Gateway). Ohne
// Route entfällt die Mail; Postfach und Push sind davon unberührt.
export async function dispatchOpeningMails(env) {
  const { results } = await env.DB.prepare(`SELECT o.*, t.owner_id FROM registration_opening_mail_outbox o
    JOIN tournaments t ON t.id = o.tournament_id ORDER BY o.id LIMIT 100`).all();
  if (!results.length) return;
  const routes = new Map();
  for (const row of results) {
    if (!routes.has(row.tournament_id)) routes.set(row.tournament_id, await tournamentMailRoute(env.DB, { owner_id: row.owner_id }));
  }
  const mails = results.filter((row) => routes.get(row.tournament_id)).map((row) => {
    const language = OPENING_EMAILS[row.language] ? row.language : 'de';
    const templates = OPENING_EMAILS[language];
    const link = openingRegistrationUrl(row.tournament_id);
    return { body: {
      ...routes.get(row.tournament_id),
      to: row.email,
      subject: templates.subject(row.tournament_name),
      text: templates.text(row.first_name, row.tournament_name, link),
      actions: [emailAction('tournament', link, language)],
      language,
      logFallback: `Registration opening email for ${row.email} (tournament ${row.tournament_id})`,
      failureContext: `registration opening reminder ${row.id}`,
      allowLogFallback: true,
    } };
  });
  if (mails.length) await env.MAIL_QUEUE.sendBatch(mails);
  await env.DB.prepare(`DELETE FROM registration_opening_mail_outbox WHERE id IN (${results.map(() => '?').join(',')})`)
    .bind(...results.map((row) => row.id)).run();
}

// SQLite-backed DO; deliberately no cloudflare:workers import so D1/Worker
// tests can exercise the real alarm handler in Node as well.
export class RegistrationOpeningScheduler {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async schedule() {
    const row = await this.env.DB.prepare(`SELECT registration_opens_at FROM tournaments
      WHERE registration_opening_pending = 1 ORDER BY registration_opens_at LIMIT 1`).first();
    const outbox = await this.env.DB.prepare(`SELECT id FROM registration_opening_push_outbox WHERE queued = 0
      UNION ALL SELECT id FROM registration_opening_mail_outbox LIMIT 1`).first();
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
