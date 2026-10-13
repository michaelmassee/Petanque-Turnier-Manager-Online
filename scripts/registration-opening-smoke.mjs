import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

if (!process.argv[2]) throw new Error('Pass the directory produced by wrangler deploy --dry-run --outdir');
const bundleDirectory = resolve(process.argv[2]);
const mf = new Miniflare(convertV4MiniflareOptions({
  rootPath: bundleDirectory, d1Persist: false, durableObjectsPersist: false,
  workers: [{ name: 'opening-smoke',
  modulesRoot: bundleDirectory,
  modules: true, scriptPath: `${bundleDirectory}/worker.js`,
  compatibilityDate: '2026-07-31', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'opening-smoke' },
  durableObjects: { REGISTRATION_OPENING_SCHEDULER: { className: 'RegistrationOpeningScheduler', useSQLite: true } },
  queueProducers: { MAIL_QUEUE: 'opening-smoke-push' },
  }],
}));
try {
  const db = await mf.getD1Database('DB');
  for (const sql of [
    `CREATE TABLE tournaments (id TEXT PRIMARY KEY, name TEXT, date TEXT, start_time TEXT, timezone TEXT, status TEXT, visibility TEXT, registration_enabled INTEGER, registration_closed INTEGER, registration_opens_at TEXT, registration_deadline TEXT, registration_opening_pending INTEGER, registration_opening_event_id TEXT, updated_at TEXT)`,
    `CREATE TABLE users (id TEXT PRIMARY KEY, language TEXT)`,
    `CREATE TABLE registration_opening_subscriptions (id TEXT PRIMARY KEY, user_id TEXT, tournament_id TEXT, created_at TEXT)`,
    `CREATE TABLE postbox_messages (id TEXT PRIMARY KEY, recipient_id TEXT, kind TEXT, event_type TEXT, event_data TEXT, created_at TEXT)`,
    `CREATE TABLE push_subscriptions (user_id TEXT, expiration_time TEXT)`,
    `CREATE TABLE registration_opening_push_outbox (id TEXT PRIMARY KEY, user_id TEXT, tournament_id TEXT, tournament_name TEXT, language TEXT, queued INTEGER DEFAULT 0)`,
    `CREATE TABLE registration_opening_schedule_changes (id INTEGER PRIMARY KEY, dirty INTEGER)`,
    `CREATE TABLE audit_log (id TEXT PRIMARY KEY, tournament_id TEXT, actor_role TEXT, action TEXT, target TEXT, details_json TEXT, created_at TEXT)`,
    `INSERT INTO registration_opening_schedule_changes VALUES (1, 1)`,
  ]) await db.prepare(sql).run();
  const ns = await mf.getDurableObjectNamespace('REGISTRATION_OPENING_SCHEDULER');
  const stub = ns.get(ns.idFromName('registration-openings'));
  for (const withSubscriber of [false, true]) {
    const id = withSubscriber ? 'with-subscriber' : 'without-subscriber';
    const opens = new Date(Date.now() + 2500).toISOString();
    await db.prepare(`INSERT INTO tournaments VALUES (?, 'Smoke Test', '2099-01-01', '10:00', 'Europe/Berlin', 'registration', 'public', 1, 0, ?, NULL, 1, NULL, ?)`)
      .bind(id, opens, new Date().toISOString()).run();
    if (withSubscriber) {
      await db.prepare("INSERT INTO users VALUES ('user1', 'de')").run();
      await db.prepare("INSERT INTO registration_opening_subscriptions VALUES ('subscription1', 'user1', ?, ?)").bind(id, new Date().toISOString()).run();
    }
    await stub.fetch('https://scheduler/sync', { method: 'POST' });
    let row;
    for (let attempt = 0; attempt < 50; attempt++) {
      row = await db.prepare('SELECT registration_opening_pending FROM tournaments WHERE id = ?').bind(id).first();
      if (!row.registration_opening_pending) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (row.registration_opening_pending) throw new Error(`Alarm did not open ${id}`);
    const { count } = await db.prepare('SELECT COUNT(*) AS count FROM postbox_messages').first();
    if (count !== Number(withSubscriber)) throw new Error('Unexpected postbox count');
    console.log(JSON.stringify({ id, registrationOpened: true, postboxMessages: count, actualCloudflareAlarm: true }));
  }
} finally { await mf.dispose(); }
