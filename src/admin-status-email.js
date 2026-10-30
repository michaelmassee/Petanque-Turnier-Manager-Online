import { CLOUDFLARE_FREE_SUMMARY_LIMITS, fetchCloudflareUsageSummary } from './cloudflare-usage-core.js';
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
    postboxCleanup: 'Gelesene Postbox-Nachrichten bereinigen',
    opening: 'Ausstehende Anmelde-Zeitsteuerung nachholen', reminders: 'Turniererinnerungen', importSync: 'Pétanque-Aktuell-Abgleich', purge: 'Datenbereinigung (falls aktiviert)',
    note: 'Bestandszahlen zeigen den aktuellen Datenbankstand. Neue Einträge zählen nur noch vorhandene Datensätze. Jobs können ohne anstehende Arbeit enden; Fehler einzelner Datensätze stehen im Worker-Protokoll. Der Mailversand erfolgt über die Warteschlange.',
    dashboard: 'PTM Online öffnen', usage: 'D1-Lesezeilen der 8 Statistikabfragen', unavailable: 'Nicht verfügbar',
    cloudflare: 'Cloudflare-Auslastung am vorherigen UTC-Kalendertag (Anteil an der Free-Plan-Tagesgrenze)', workerRequests: 'Worker-Aufrufe', errors: 'Fehler', cpuPerRequest: 'CPU je Aufruf (Durchschnitt)', d1RowsRead: 'D1 gelesene Zeilen', d1RowsWritten: 'D1 geschriebene Zeilen', durableObjectRequests: 'Durable-Object-Aufrufe', activeTime: 'aktiv', websockets: 'WebSocket-Nachrichten empfangen / gesendet', websocketMax: 'höchstens gleichzeitig verbunden', queueOperations: 'Queue-Operationen', of: 'von', limitWarning: 'Achtung: nahe an der Tagesgrenze',
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
    postboxCleanup: 'Clean up read inbox messages',
    opening: 'Recover pending registration scheduling', reminders: 'Tournament reminders', importSync: 'Pétanque Aktuell synchronization', purge: 'Personal data cleanup (if enabled)',
    note: 'Totals reflect the current database state. New entries count only records that still exist. Jobs may have no work due; errors for individual records are in the Worker logs. Email is delivered through the queue.',
    dashboard: 'Open PTM Online', usage: 'D1 rows read by the 8 statistics queries', unavailable: 'Unavailable',
    cloudflare: 'Cloudflare usage on the previous UTC calendar day (share of the Free plan daily limit)', workerRequests: 'Worker requests', errors: 'Errors', cpuPerRequest: 'CPU per request (average)', d1RowsRead: 'D1 rows read', d1RowsWritten: 'D1 rows written', durableObjectRequests: 'Durable Object requests', activeTime: 'active', websockets: 'WebSocket messages received / sent', websocketMax: 'peak concurrent connections', queueOperations: 'Queue operations', of: 'of', limitWarning: 'Warning: close to the daily limit',
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
    postboxCleanup: 'Nettoyer les messages lus de la boîte de réception',
    opening: 'Rétablir la planification des inscriptions en attente', reminders: 'Rappels de tournoi', importSync: 'Synchronisation Pétanque Aktuell', purge: 'Nettoyage des données personnelles (si activé)',
    note: 'Les totaux reflètent l’état actuel de la base. Les nouveaux éléments ne comptent que les enregistrements encore présents. Une tâche peut ne rien avoir à traiter ; les erreurs de certains enregistrements figurent dans les journaux du Worker. Les e-mails passent par la file d’attente.',
    dashboard: 'Ouvrir PTM Online', usage: 'Lignes D1 lues par les 8 requêtes statistiques', unavailable: 'Indisponible',
    cloudflare: 'Utilisation Cloudflare du jour civil UTC précédent (part de la limite quotidienne du plan gratuit)', workerRequests: 'Appels du Worker', errors: 'Erreurs', cpuPerRequest: 'CPU par appel (moyenne)', d1RowsRead: 'Lignes D1 lues', d1RowsWritten: 'Lignes D1 écrites', durableObjectRequests: 'Appels Durable Object', activeTime: 'actif', websockets: 'Messages WebSocket reçus / envoyés', websocketMax: 'connexions simultanées au maximum', queueOperations: 'Opérations de file d’attente', of: 'sur', limitWarning: 'Attention : proche de la limite quotidienne',
    adminMessages: 'Messages qui vous sont adressés pendant la période du rapport', sender: 'Expéditeur', sentAt: 'Envoyé (UTC)', message: 'Message', deletedSender: 'Compte supprimé',
  },
  it: {
    subject: 'PTM Online – rapporto giornaliero per gli amministratori', period: 'Periodo del rapporto (UTC)',
    inventory: 'Totale attuale / nuovi nelle ultime 24 ore', total: 'Totale', users: 'Account utente', verified: 'E-mail confermata', admins: 'Amministratori',
    tournaments: 'Tornei con iscrizione', calendar: 'Eventi del calendario', draft: 'Bozza', registration: 'Fase di iscrizione', running: 'In corso', finished: 'Concluso',
    registrations: 'Iscrizioni (squadre o singoli)', pending: 'In attesa', confirmed: 'Confermate', waitlist: 'Lista d’attesa', cancelled: 'Annullate', rejected: 'Rifiutate',
    moderation: 'Approvazioni in sospeso', apiKeys: 'Chiavi API', clubs: 'Club / federazioni', clubEditors: 'Richieste di gestione club', places: 'Campi di pétanque indipendenti',
    listings: 'Bacheca giocatori', imports: 'Importazioni Pétanque Aktuell', synced: 'Sincronizzati nelle ultime 24 ore',
    visitors: 'Visitatori del giorno solare UTC precedente', guests: 'Ospiti', signedIn: 'Account con accesso',
    jobs: 'Attività di manutenzione di questa esecuzione cron', ok: 'Completata senza interruzioni', failed: 'Non riuscita – controlla i log del Worker',
    stale: 'Concludere i vecchi tornei in corso', cleanup: 'Pulire sessioni e token scaduti', listingsCleanup: 'Rimuovere gli annunci dei tornei conclusi',
    rentalsCleanup: 'Rimuovere richieste di noleggio e prenotazioni scadute',
    postboxCleanup: 'Pulire i messaggi letti della casella di posta',
    opening: 'Ripristinare la pianificazione delle aperture iscrizioni', reminders: 'Promemoria dei tornei', importSync: 'Sincronizzazione Pétanque Aktuell', purge: 'Pulizia dei dati personali (se attiva)',
    note: 'I totali riflettono lo stato attuale del database. I nuovi elementi contano solo i record ancora presenti. Un’attività può non avere nulla da elaborare; gli errori di singoli record sono nei log del Worker. Le e-mail passano dalla coda.',
    dashboard: 'Apri PTM Online', usage: 'Righe D1 lette dalle 8 query statistiche', unavailable: 'Non disponibile',
    cloudflare: 'Utilizzo Cloudflare del giorno solare UTC precedente (quota del limite giornaliero del piano gratuito)', workerRequests: 'Chiamate al Worker', errors: 'Errori', cpuPerRequest: 'CPU per chiamata (media)', d1RowsRead: 'Righe D1 lette', d1RowsWritten: 'Righe D1 scritte', durableObjectRequests: 'Chiamate Durable Object', activeTime: 'attivo', websockets: 'Messaggi WebSocket ricevuti / inviati', websocketMax: 'connessioni simultanee al massimo', queueOperations: 'Operazioni della coda', of: 'su', limitWarning: 'Attenzione: vicino al limite giornaliero',
    adminMessages: 'Messaggi indirizzati a te nel periodo del rapporto', sender: 'Mittente', sentAt: 'Inviato (UTC)', message: 'Messaggio', deletedSender: 'Account eliminato',
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
    postboxCleanup: 'Gelezen postbusberichten opruimen',
    opening: 'Openstaande inschrijvingsplanning herstellen', reminders: 'Toernooiherinneringen', importSync: 'Pétanque Aktuell-synchronisatie', purge: 'Persoonsgegevens opruimen (indien ingeschakeld)',
    note: 'Totalen tonen de huidige database-inhoud. Nieuwe items tellen alleen nog bestaande records. Taken kunnen zonder openstaand werk eindigen; fouten voor afzonderlijke records staan in de Worker-logboeken. E-mail wordt via de wachtrij verzonden.',
    dashboard: 'PTM Online openen', usage: 'D1-rijen gelezen door de 8 statistiekquery’s', unavailable: 'Niet beschikbaar',
    cloudflare: 'Cloudflare-gebruik op de vorige UTC-kalenderdag (aandeel van de dagelijkse limiet van het gratis abonnement)', workerRequests: 'Worker-aanroepen', errors: 'Fouten', cpuPerRequest: 'CPU per aanroep (gemiddeld)', d1RowsRead: 'Gelezen D1-rijen', d1RowsWritten: 'Geschreven D1-rijen', durableObjectRequests: 'Durable Object-aanroepen', activeTime: 'actief', websockets: 'WebSocket-berichten ontvangen / verzonden', websocketMax: 'maximaal gelijktijdig verbonden', queueOperations: 'Wachtrijbewerkingen', of: 'van', limitWarning: 'Let op: dicht bij de daglimiet',
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
    postboxCleanup: 'Limpiar los mensajes leídos del buzón',
    opening: 'Recuperar la programación de inscripciones pendiente', reminders: 'Recordatorios de torneos', importSync: 'Sincronización de Pétanque Aktuell', purge: 'Limpieza de datos personales (si está activada)',
    note: 'Los totales reflejan el estado actual de la base de datos. Los nuevos elementos solo cuentan registros que aún existen. Las tareas pueden no tener trabajo pendiente; los errores de registros individuales figuran en los registros del Worker. El correo se envía mediante la cola.',
    dashboard: 'Abrir PTM Online', usage: 'Filas D1 leídas por las 8 consultas estadísticas', unavailable: 'No disponible',
    cloudflare: 'Uso de Cloudflare del día natural UTC anterior (parte del límite diario del plan gratuito)', workerRequests: 'Llamadas al Worker', errors: 'Errores', cpuPerRequest: 'CPU por llamada (media)', d1RowsRead: 'Filas D1 leídas', d1RowsWritten: 'Filas D1 escritas', durableObjectRequests: 'Llamadas a Durable Object', activeTime: 'activo', websockets: 'Mensajes WebSocket recibidos / enviados', websocketMax: 'conexiones simultáneas como máximo', queueOperations: 'Operaciones de cola', of: 'de', limitWarning: 'Atención: cerca del límite diario',
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

const LIMIT_WARNING_SHARE = 0.8;

function cloudflareUsageLines(usage, l, language) {
  if (!usage) return [`${l.cloudflare}: ${l.unavailable}`];
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const withLimit = (label, key) => {
    const share = usage[key] / CLOUDFLARE_FREE_SUMMARY_LIMITS[key];
    const warning = share >= LIMIT_WARNING_SHARE ? ` – ${l.limitWarning}` : '';
    return `${label}: ${number.format(usage[key])} ${l.of} ${number.format(CLOUDFLARE_FREE_SUMMARY_LIMITS[key])} (${percent.format(share)})${warning}`;
  };
  return [
    `${l.cloudflare} (${usage.day})`,
    `${withLimit(l.workerRequests, 'workerRequests')}; ${l.errors}: ${number.format(usage.workerErrors)}`,
    `${l.cpuPerRequest}: ${number.format(usage.cpuMsPerRequest)} ms`,
    withLimit(l.d1RowsRead, 'd1RowsRead'),
    withLimit(l.d1RowsWritten, 'd1RowsWritten'),
    `${withLimit(l.durableObjectRequests, 'durableObjectRequests')}; ${l.activeTime}: ${number.format(usage.durableObjectActiveSeconds)} s`,
    `${l.websockets}: ${number.format(usage.websocketIn)} / ${number.format(usage.websocketOut)}; ${l.websocketMax}: ${number.format(usage.websocketMax)}`,
    withLimit(l.queueOperations, 'queueOperations'),
  ];
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
    '', ...cloudflareUsageLines(stats.cloudflareUsage, l, language),
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
  // Aufräumen ist nachrangig: Schlägt es fehl, geht der Bericht trotzdem raus; der nächste Lauf räumt nach.
  try {
    await env.DB.prepare('DELETE FROM admin_status_reports WHERE report_day < ?')
      .bind(new Date(scheduledTime - 7 * DAY_MS).toISOString().slice(0, 10)).run();
    await env.DB.prepare('DELETE FROM admin_postbox_messages WHERE created_at < ?')
      .bind(new Date(scheduledTime - 7 * DAY_MS).toISOString()).run();
  } catch (error) {
    console.error('Admin status cleanup failed', error);
  }
  const admins = await env.DB.prepare(`SELECT u.id, u.email, u.language FROM users u
    WHERE u.role = 'admin' AND u.email_verified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM admin_status_reports r WHERE r.report_day = ? AND r.user_id = u.id)`)
    .bind(day).all();
  if (!admins.results.length) return;
  const stats = await collectAdminStatus(env.DB, from, until, systemUserId);
  // Fehlt die Auslastung (kein Token, API-Fehler), geht der Bericht trotzdem raus.
  stats.cloudflareUsage = await fetchCloudflareUsageSummary(env, stats.previousDay).catch((error) => {
    console.error('Cloudflare usage for admin status failed', error);
    return null;
  });
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
