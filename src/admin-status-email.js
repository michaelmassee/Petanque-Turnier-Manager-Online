import { richTextPlainText } from './lib/rich-text.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Wie die übrigen Worker-Mailvorlagen: alle unterstützten Kontosprachen, DE als Fallback.
export const ADMIN_STATUS_LABELS = {
  de: {
    subject: 'PTM Online – täglicher Administrator-Status', period: 'Berichtszeitraum (UTC)',
    inventory: 'Bestand / neu in den letzten 24 Stunden', total: 'Gesamt', users: 'Benutzerkonten', verified: 'E-Mail bestätigt', admins: 'Administratoren',
    tournaments: 'Turniere mit Anmeldung', calendar: 'Kalendereinträge', draft: 'Entwurf', registration: 'Anmeldephase', running: 'Läuft', finished: 'Abgeschlossen',
    registrations: 'Anmeldungen (Teams bzw. Einzelmeldungen)', pending: 'Unbestätigt', confirmed: 'Bestätigt', waitlist: 'Warteliste', cancelled: 'Storniert', rejected: 'Abgelehnt',
    moderation: 'Offene Freigaben', apiKeys: 'API-Schlüssel', clubs: 'Vereine / Verbände', clubEditors: 'Vereinsbearbeiter-Anfragen', places: 'Unabhängige Bouleplätze',
    listings: 'Spielerbörse', imports: 'Pétanque-Aktuell-Importe', synced: 'In den letzten 24 Stunden synchronisiert',
    visitors: 'Besucher am vorherigen UTC-Kalendertag', guests: 'Gäste', signedIn: 'Angemeldete Konten',
    jobs: 'Wartungsjobs dieses Cron-Laufs', ok: 'Beendet ohne Abbruch', failed: 'Fehlgeschlagen – Worker-Protokoll prüfen',
    stale: 'Alte laufende Turniere abschließen', cleanup: 'Abgelaufene Sitzungen und Tokens bereinigen', listingsCleanup: 'Spielergesuche beendeter Turniere löschen',
    rentalsCleanup: 'Abgelaufene Mietanfragen und Reservierungen löschen',
    opening: 'Ausstehende Anmelde-Zeitsteuerung nachholen', reminders: 'Turniererinnerungen', importSync: 'Pétanque-Aktuell-Abgleich', purge: 'Datenbereinigung (falls aktiviert)',
    note: 'Bestandszahlen zeigen den aktuellen Datenbankstand. Neue Einträge zählen nur noch vorhandene Datensätze. Jobs können ohne anstehende Arbeit enden; Fehler einzelner Datensätze stehen im Worker-Protokoll. Der Mailversand erfolgt über die Warteschlange.',
    dashboard: 'PTM Online öffnen', usage: 'D1-Lesezeilen der 8 Statistikabfragen', unavailable: 'Nicht verfügbar',
    adminMessages: 'An dich gerichtete Postbox-Nachrichten im Berichtszeitraum', sender: 'Absender', sentAt: 'Gesendet (UTC)', message: 'Nachricht', deletedSender: 'Gelöschtes Konto',
  },
  en: {
    subject: 'PTM Online – daily administrator status', period: 'Reporting period (UTC)',
    inventory: 'Current total / new in the last 24 hours', total: 'Total', users: 'User accounts', verified: 'Email verified', admins: 'Administrators',
    tournaments: 'Tournaments with registration', calendar: 'Calendar entries', draft: 'Draft', registration: 'Registration phase', running: 'Running', finished: 'Finished',
    registrations: 'Registrations (teams or individuals)', pending: 'Pending', confirmed: 'Confirmed', waitlist: 'Waitlist', cancelled: 'Cancelled', rejected: 'Rejected',
    moderation: 'Pending approvals', apiKeys: 'API keys', clubs: 'Clubs / associations', clubEditors: 'Club editor requests', places: 'Independent pétanque venues',
    listings: 'Player exchange', imports: 'Pétanque Aktuell imports', synced: 'Synchronized in the last 24 hours',
    visitors: 'Visitors on the previous UTC calendar day', guests: 'Guests', signedIn: 'Signed-in accounts',
    jobs: 'Maintenance jobs in this cron run', ok: 'Completed without aborting', failed: 'Failed – check Worker logs',
    stale: 'Finish stale running tournaments', cleanup: 'Clean up expired sessions and tokens', listingsCleanup: 'Delete player listings for finished tournaments',
    rentalsCleanup: 'Delete expired rental requests and reservations',
    opening: 'Recover pending registration scheduling', reminders: 'Tournament reminders', importSync: 'Pétanque Aktuell synchronization', purge: 'Personal data cleanup (if enabled)',
    note: 'Totals reflect the current database state. New entries count only records that still exist. Jobs may have no work due; errors for individual records are in the Worker logs. Email is delivered through the queue.',
    dashboard: 'Open PTM Online', usage: 'D1 rows read by the 8 statistics queries', unavailable: 'Unavailable',
    adminMessages: 'Inbox messages addressed to you in the reporting period', sender: 'Sender', sentAt: 'Sent (UTC)', message: 'Message', deletedSender: 'Deleted account',
  },
  fr: {
    subject: 'PTM Online – rapport quotidien aux administrateurs', period: 'Période du rapport (UTC)',
    inventory: 'Total actuel / nouveaux sur les dernières 24 heures', total: 'Total', users: 'Comptes utilisateurs', verified: 'E-mail confirmé', admins: 'Administrateurs',
    tournaments: 'Tournois avec inscription', calendar: 'Événements du calendrier', draft: 'Brouillon', registration: 'Phase d’inscription', running: 'En cours', finished: 'Terminé',
    registrations: 'Inscriptions (équipes ou individus)', pending: 'En attente', confirmed: 'Confirmées', waitlist: 'Liste d’attente', cancelled: 'Annulées', rejected: 'Refusées',
    moderation: 'Validations en attente', apiKeys: 'Clés API', clubs: 'Clubs / fédérations', clubEditors: 'Demandes de gestion de club', places: 'Terrains de pétanque indépendants',
    listings: 'Bourse aux joueurs', imports: 'Imports Pétanque Aktuell', synced: 'Synchronisés sur les dernières 24 heures',
    visitors: 'Visiteurs du jour civil UTC précédent', guests: 'Invités', signedIn: 'Comptes connectés',
    jobs: 'Tâches de maintenance de cette exécution cron', ok: 'Terminée sans interruption', failed: 'Échec – consulter les journaux du Worker',
    stale: 'Terminer les anciens tournois en cours', cleanup: 'Nettoyer les sessions et jetons expirés', listingsCleanup: 'Supprimer les annonces des tournois terminés',
    rentalsCleanup: 'Supprimer les demandes de location et réservations expirées',
    opening: 'Rétablir la planification des inscriptions en attente', reminders: 'Rappels de tournoi', importSync: 'Synchronisation Pétanque Aktuell', purge: 'Nettoyage des données personnelles (si activé)',
    note: 'Les totaux reflètent l’état actuel de la base. Les nouveaux éléments ne comptent que les enregistrements encore présents. Une tâche peut ne rien avoir à traiter ; les erreurs de certains enregistrements figurent dans les journaux du Worker. Les e-mails passent par la file d’attente.',
    dashboard: 'Ouvrir PTM Online', usage: 'Lignes D1 lues par les 8 requêtes statistiques', unavailable: 'Indisponible',
    adminMessages: 'Messages qui vous sont adressés pendant la période du rapport', sender: 'Expéditeur', sentAt: 'Envoyé (UTC)', message: 'Message', deletedSender: 'Compte supprimé',
  },
  nl: {
    subject: 'PTM Online – dagelijkse beheerdersstatus', period: 'Rapportperiode (UTC)',
    inventory: 'Huidig totaal / nieuw in de afgelopen 24 uur', total: 'Totaal', users: 'Gebruikersaccounts', verified: 'E-mail bevestigd', admins: 'Beheerders',
    tournaments: 'Toernooien met inschrijving', calendar: 'Kalenderitems', draft: 'Concept', registration: 'Inschrijffase', running: 'Bezig', finished: 'Afgerond',
    registrations: 'Inschrijvingen (teams of individuen)', pending: 'Onbevestigd', confirmed: 'Bevestigd', waitlist: 'Wachtlijst', cancelled: 'Geannuleerd', rejected: 'Afgewezen',
    moderation: 'Openstaande goedkeuringen', apiKeys: 'API-sleutels', clubs: 'Verenigingen / bonden', clubEditors: 'Aanvragen voor verenigingsbeheer', places: 'Onafhankelijke boulebanen',
    listings: 'Spelersbeurs', imports: 'Pétanque Aktuell-imports', synced: 'Gesynchroniseerd in de afgelopen 24 uur',
    visitors: 'Bezoekers op de vorige UTC-kalenderdag', guests: 'Gasten', signedIn: 'Ingelogde accounts',
    jobs: 'Onderhoudstaken van deze cron-uitvoering', ok: 'Voltooid zonder afbreken', failed: 'Mislukt – controleer de Worker-logboeken',
    stale: 'Oude lopende toernooien afronden', cleanup: 'Verlopen sessies en tokens opruimen', listingsCleanup: 'Spelersoproepen van afgeronde toernooien verwijderen',
    rentalsCleanup: 'Verlopen huuraanvragen en reserveringen verwijderen',
    opening: 'Openstaande inschrijvingsplanning herstellen', reminders: 'Toernooiherinneringen', importSync: 'Pétanque Aktuell-synchronisatie', purge: 'Persoonsgegevens opruimen (indien ingeschakeld)',
    note: 'Totalen tonen de huidige database-inhoud. Nieuwe items tellen alleen nog bestaande records. Taken kunnen zonder openstaand werk eindigen; fouten voor afzonderlijke records staan in de Worker-logboeken. E-mail wordt via de wachtrij verzonden.',
    dashboard: 'PTM Online openen', usage: 'D1-rijen gelezen door de 8 statistiekquery’s', unavailable: 'Niet beschikbaar',
    adminMessages: 'Postbusberichten aan jou in de rapportperiode', sender: 'Afzender', sentAt: 'Verzonden (UTC)', message: 'Bericht', deletedSender: 'Verwijderd account',
  },
  es: {
    subject: 'PTM Online – estado diario para administradores', period: 'Período del informe (UTC)',
    inventory: 'Total actual / nuevos en las últimas 24 horas', total: 'Total', users: 'Cuentas de usuario', verified: 'Correo confirmado', admins: 'Administradores',
    tournaments: 'Torneos con inscripción', calendar: 'Eventos del calendario', draft: 'Borrador', registration: 'Fase de inscripción', running: 'En curso', finished: 'Finalizado',
    registrations: 'Inscripciones (equipos o individuales)', pending: 'Pendientes', confirmed: 'Confirmadas', waitlist: 'Lista de espera', cancelled: 'Canceladas', rejected: 'Rechazadas',
    moderation: 'Aprobaciones pendientes', apiKeys: 'Claves API', clubs: 'Clubes / federaciones', clubEditors: 'Solicitudes de gestión de clubes', places: 'Pistas de petanca independientes',
    listings: 'Bolsa de jugadores', imports: 'Importaciones de Pétanque Aktuell', synced: 'Sincronizadas en las últimas 24 horas',
    visitors: 'Visitantes del día natural UTC anterior', guests: 'Invitados', signedIn: 'Cuentas conectadas',
    jobs: 'Tareas de mantenimiento de esta ejecución cron', ok: 'Finalizada sin interrupción', failed: 'Fallida – consultar los registros del Worker',
    stale: 'Finalizar torneos antiguos en curso', cleanup: 'Eliminar sesiones y tokens caducados', listingsCleanup: 'Eliminar anuncios de torneos finalizados',
    rentalsCleanup: 'Eliminar solicitudes de alquiler y reservas caducadas',
    opening: 'Recuperar la programación de inscripciones pendiente', reminders: 'Recordatorios de torneos', importSync: 'Sincronización de Pétanque Aktuell', purge: 'Limpieza de datos personales (si está activada)',
    note: 'Los totales reflejan el estado actual de la base de datos. Los nuevos elementos solo cuentan registros que aún existen. Las tareas pueden no tener trabajo pendiente; los errores de registros individuales figuran en los registros del Worker. El correo se envía mediante la cola.',
    dashboard: 'Abrir PTM Online', usage: 'Filas D1 leídas por las 8 consultas estadísticas', unavailable: 'No disponible',
    adminMessages: 'Mensajes del buzón dirigidos a ti durante el período del informe', sender: 'Remitente', sentAt: 'Enviado (UTC)', message: 'Mensaje', deletedSender: 'Cuenta eliminada',
  },
};

export async function collectAdminStatus(db, from, until, systemUserId) {
  const window = 'created_at >= ? AND created_at < ?';
  const previousDay = new Date(new Date(until).getTime() - DAY_MS).toISOString().slice(0, 10);
  const results = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total, SUM(${window}) AS added,
      SUM(email_verified_at IS NOT NULL) AS verified, SUM(role = 'admin') AS admins FROM users WHERE id != ?`)
      .bind(from, until, systemUserId),
    db.prepare(`SELECT registration_enabled, status, COUNT(*) AS total, SUM(${window}) AS added
      FROM tournaments GROUP BY registration_enabled, status`).bind(from, until),
    db.prepare(`SELECT status, COUNT(*) AS total, SUM(${window}) AS added FROM registrations GROUP BY status`).bind(from, until),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM api_keys WHERE status = 'pending') AS apiKeys,
      (SELECT COUNT(*) FROM clubs WHERE status = 'pending') AS clubs,
      (SELECT COUNT(*) FROM club_editor_requests) AS clubEditors,
      (SELECT COUNT(*) FROM boule_places WHERE club_id IS NULL AND status = 'pending') AS places`),
    db.prepare(`SELECT COUNT(*) AS total, SUM(${window}) AS added FROM player_listings`).bind(from, until),
    db.prepare(`SELECT COUNT(*) AS total, SUM(synced_at >= ? AND synced_at < ?) AS synced FROM petanque_aktuell_imports`).bind(from, until),
    db.prepare('SELECT kind, visitors FROM visitor_daily_counts WHERE day = ?').bind(previousDay),
    db.prepare(`SELECT m.recipient_id, m.body, m.created_at,
      s.first_name AS sender_first_name, s.last_name AS sender_last_name, s.username AS sender_username
      FROM admin_postbox_messages m LEFT JOIN users s ON s.id = m.sender_id
      WHERE m.created_at >= ? AND m.created_at < ? ORDER BY m.created_at, m.message_id`).bind(from, until),
  ]);
  return {
    users: results[0].results[0], tournaments: results[1].results, registrations: results[2].results,
    moderation: results[3].results[0], listings: results[4].results[0], imports: results[5].results[0],
    visitors: results[6].results, previousDay, adminMessages: results[7].results,
    // D1 liefert Abrechnungsmetriken ohnehin mit: keine zusätzliche Analytics-Abfrage nötig.
    statisticsRowsRead: results.every((result) => Number.isFinite(result.meta?.rows_read))
      ? results.reduce((total, result) => total + result.meta.rows_read, 0) : null,
  };
}

export function buildAdminStatusEmail(stats, jobs, from, until, language = 'de', recipientId = null) {
  const l = ADMIN_STATUS_LABELS[language] || ADMIN_STATUS_LABELS.de;
  const count = (value) => Number(value || 0);
  const pair = (label, row) => `${label}: ${count(row?.total)} / +${count(row?.added)}`;
  const tournaments = stats.tournaments.filter((row) => Number(row.registration_enabled) === 1);
  const sum = (rows) => rows.reduce((all, row) => ({ total: all.total + count(row.total), added: all.added + count(row.added) }), { total: 0, added: 0 });
  const messages = (stats.adminMessages || []).filter((message) => message.recipient_id === recipientId);
  const text = [
    `${l.period}: ${from} – ${until}`,
    l.inventory,
    pair(l.users, stats.users), `${l.verified}: ${count(stats.users.verified)}; ${l.admins}: ${count(stats.users.admins)}`,
    '', pair(l.tournaments, sum(tournaments)),
    ...['draft', 'registration', 'running', 'finished'].map((status) => pair(`  ${l[status]}`, tournaments.find((row) => row.status === status))),
    pair(l.calendar, sum(stats.tournaments.filter((row) => Number(row.registration_enabled) === 0))),
    '', pair(l.registrations, sum(stats.registrations)),
    ...['pending', 'confirmed', 'waitlist', 'cancelled', 'rejected'].map((status) => pair(`  ${l[status]}`, stats.registrations.find((row) => row.status === status))),
    '', l.moderation,
    ...['apiKeys', 'clubs', 'clubEditors', 'places'].map((key) => `${l[key]}: ${count(stats.moderation[key])}`),
    '', pair(l.listings, stats.listings), `${l.imports}: ${count(stats.imports.total)}; ${l.synced}: ${count(stats.imports.synced)}`,
    '', `${l.visitors} (${stats.previousDay})`,
    `${l.guests}: ${count(stats.visitors.find((row) => row.kind === 'guest')?.visitors)}`,
    `${l.signedIn}: ${count(stats.visitors.find((row) => row.kind === 'user')?.visitors)}`,
    '', `${l.adminMessages}: ${messages.length}`,
    ...messages.flatMap((message) => [
      '', `${l.sender}: ${[message.sender_first_name, message.sender_last_name].filter(Boolean).join(' ') || message.sender_username || l.deletedSender}`,
      `${l.sentAt}: ${message.created_at}`,
      `${l.message}:\n${richTextPlainText(message.body)}`,
    ]),
    '', l.jobs, ...jobs.map((job) => `${l[job.key]}: ${job.ok ? l.ok : l.failed}`),
    '', `${l.usage}: ${stats.statisticsRowsRead ?? l.unavailable}`,
    '', l.note, '', `${l.dashboard}: https://ptmonline.org/`,
  ].join('\n');
  return { subject: `${l.subject} (${until.slice(0, 10)})`, text, language: ADMIN_STATUS_LABELS[language] ? language : 'de' };
}

export async function sendAdminStatusEmails(env, jobs, scheduledTime, systemUserId) {
  if (!env.MAIL_QUEUE) throw new Error('Admin status email requires MAIL_QUEUE');
  // Festes Cron-Zeitfenster statt tatsächlicher Ausführungszeit: Wiederholungen bleiben identisch.
  const until = new Date(scheduledTime).toISOString();
  const from = new Date(scheduledTime - DAY_MS).toISOString();
  const day = until.slice(0, 10);
  await env.DB.prepare('DELETE FROM admin_status_reports WHERE report_day < ?')
    .bind(new Date(scheduledTime - 7 * DAY_MS).toISOString().slice(0, 10)).run();
  await env.DB.prepare('DELETE FROM admin_postbox_messages WHERE created_at < ?')
    .bind(new Date(scheduledTime - 7 * DAY_MS).toISOString()).run();
  const admins = await env.DB.prepare(`SELECT u.id, u.email, u.language FROM users u
    WHERE u.role = 'admin' AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM admin_status_reports r WHERE r.report_day = ? AND r.user_id = u.id)`)
    .bind(day).all();
  if (!admins.results.length) return;
  const stats = await collectAdminStatus(env.DB, from, until, systemUserId);
  const failures = [];
  for (const admin of admins.results) {
    const claim = await env.DB.prepare('INSERT OR IGNORE INTO admin_status_reports (report_day, user_id, queued_at) VALUES (?, ?, ?)')
      .bind(day, admin.id, new Date().toISOString()).run();
    if (!claim.meta.changes) continue;
    try {
      await env.MAIL_QUEUE.send({
        to: admin.email, ...buildAdminStatusEmail(stats, jobs, from, until, admin.language, admin.id),
        failureContext: `daily admin status ${day} for ${admin.id}`,
      });
    } catch (error) {
      // Nur den gescheiterten Empfänger freigeben; erfolgreiche Queue-Aufträge bleiben dedupliziert.
      await env.DB.prepare('DELETE FROM admin_status_reports WHERE report_day = ? AND user_id = ?').bind(day, admin.id).run();
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Failed to enqueue admin status email');
}
