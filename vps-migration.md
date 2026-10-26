# Migrationsplan: Cloudflare Workers + D1 → VPS

Stand: 2026-10-09, aktualisiert 2026-10-26 (neue Bindungen: Durable Object, Rate-Limits, Edge-Cache-Listen, Cloudflare-Verbrauchsanzeige). Status: **Plan, nicht begonnen.** Phase 1 (Abschnitte 1–13): weg von Workers + D1, Cloudflare Free bleibt als DNS/Proxy/Tunnel. Phase 2 (Abschnitt 14, optional): komplett ohne Cloudflare. Hintergrund und Kostenanalyse siehe `guard-cloudflare.md`.

## 1. Ziel

- **Feste Kosten statt Abrechnung nach Verbrauch:** Last soll Performance kosten, nie Geld, und nie
  einen Totalausfall wie am 08.10. (D1-Free-Limit) verursachen.
- **Möglichst wenig Code-Änderung:** `src/worker.js` bleibt ein Fetch-Handler. Die
  Cloudflare-Bindungen werden auf dem Server nachgebildet.
- **Cloudflare bleibt davor:** DNS, Proxy, WAF und DDoS-Schutz im Free-Plan, ohne Abrechnung nach
  Verbrauch, angebunden per Cloudflare Tunnel.
- **Keine Dauer-Optimierung gegen Free-Limits mehr:** Seit dem 08.10. kostet fast jede neue
  Funktion Arbeit gegen D1-Lesezeilen (5 Mio./Tag) und das CPU-Limit (10 ms je Anfrage). Beispiel
  26.10.: 2,48 Mio. gelesene Zeilen, davon 1,45 Mio. durch die Plätzeliste (etwa 3.800 Zeilen je
  Aufruf, angemeldet immer ungecacht), CPU p99 bis 45 ms. Details in `docs/plaetze-karte-todo.md`.
  Auf dem VPS kostet eine solche Abfrage unter 1 ms und kein Geld.

## 2. Zielarchitektur

```
Besucher ──HTTPS──▶ Cloudflare (DNS, Proxy, WAF, Rate-Limit, Cache)
                        ▲
                        │ ausgehender Tunnel (cloudflared), kein offener Port
                        │
VPS (Debian 13 minimal) │
  ├─ cloudflared ───────┘──▶ http://127.0.0.1:8787
  ├─ ptm-online (Node 24 LTS, systemd)
  │    ├─ HTTP-Adapter → worker.fetch(request, env)
  │    ├─ env.DB          → D1-Adapter auf SQLite-Datei (/var/lib/ptm/ptm.sqlite, WAL)
  │    ├─ env.ASSETS      → statische Dateien aus dist/ (SPA-Fallback)
  │    ├─ env.MAIL_QUEUE  → Job-Tabelle in SQLite + Abarbeitung im Prozess
  │    ├─ Cron            → worker.scheduled() im Prozess (stündlich, täglich 01:00 UTC)
  │    ├─ env.REGISTRATION_OPENING_SCHEDULER → Durable-Object-Nachbildung (Alarm per Timer,
  │    │                     Alarmzeit in SQLite, überlebt Neustarts)
  │    ├─ env.PLAYER_DETAILS_*_LIMIT → Rate-Limiter im Speicher (Fenster 60 s)
  │    └─ caches.default  → kleiner In-Memory-Cache (Image-Proxy, Live-Snapshot, anonyme Listen)
  └─ Backup (systemd-Timer): sqlite3 .backup → restic → externer Speicher
```

Server: **VPS S** – 1 vCore, 2 GB RAM, 60 GB NVMe, etwa 4 € pro Monat (Entscheidung 2026-10-26).
VPS M (2 vCores, 4 GB, 120 GB, etwa 10 €) bringt für diese Last keinen Vorteil, weil Node die App
in einem Thread ausführt. Der zweite Kern entlastet nur Nebenarbeit (Backup, `npm ci`, Updates).
Vor Vertragsabschluss klären, ob ein späteres Upgrade ohne Neuinstallation möglich ist.

Last und Bedarf (Schätzung, Stand 2026-10-26):

| | Wert |
|---|---|
| Heutige Last | bis etwa 11.000 Requests pro Tag, im Schnitt 0,13 pro Sekunde, Spitzenstunde etwa 1 pro Sekunde |
| Datenbank | 3,3 MB (62 Tabellen), `dist/` 5,5 MB |
| RAM-Bedarf | etwa 0,5–0,7 GB (Debian etwa 150 MB, Node etwa 150–300 MB, `cloudflared` etwa 40 MB); die DB liegt komplett im Page-Cache |
| Kapazität einfache API-Anfragen (1–3 ms) | etwa 300–1.000 pro Sekunde |
| Kapazität volle Plätzeliste (3.800 Zeilen + JSON, 5–15 ms) | etwa 70–200 pro Sekunde |
| Live-Ansicht (Polling alle 15 s, Snapshot gecacht) | über 1.000 gleichzeitige Zuschauer, das sind etwa 70 Anfragen pro Sekunde |

Abstand zur heutigen Spitze: etwa das 100- bis 1.000-Fache.

Hinweise für einen Kern:
- Kein `npm run build` auf dem Server, nur lokal (siehe Abschnitt 7).
- Lange synchrone Rechnungen blockieren alle anderen Anfragen. Das Arbeitsbudget der
  Supermêlée-Auslosung (etwa 5 ms) bleibt deshalb sinnvoll.
- Passwort-Hashing über `crypto.subtle` läuft in Node außerhalb des Haupt-Threads.
- Geteilte vCores können unter Fremdlast schwanken; bei dieser Auslastung unerheblich.

## 3. Bestandsaufnahme: Cloudflare-Abhängigkeiten im Code

| Stelle | Nutzung | Ersatz auf dem VPS |
|---|---|---|
| `env.DB` (knapp 1.000×) | D1-API: `prepare().bind().first/all/run`, `batch` | **D1-Adapter** über SQLite. Vorlage `src/test-support/d1.js`, für den Betrieb ausbauen: `meta` (changes, last_row_id, rows_read/rows_written), `batch` als Transaktion, `first(column)`, Fehlermeldungen wie D1 |
| `env.ASSETS` (1×) | SPA aus `dist/` | Static-Handler mit SPA-Fallback auf `index.html` und korrektem `Content-Type`; Cache-Header für `/assets/*` (immutable) |
| `env.MAIL_QUEUE` (12×, `send`/`sendBatch`) + `queue`-Handler | Mail- und Push-Versand entkoppelt, `max_retries: 3`, DLQ | Tabelle `queue_jobs` (id, body, attempts, run_after, failed_at). Abarbeitung im Prozess (Intervall 5 s, Batch 3) ruft den bestehenden `queue(batch, env)` mit `messages[].body/ack()/retry()` auf. Nach 3 Fehlversuchen `failed_at` setzen, das entspricht der DLQ |
| `scheduled` + `triggers.crons` | `0 * * * *`, `0 1 * * *` | In-Process-Scheduler mit `croner` (UTC), ruft `worker.scheduled({ cron }, env, ctx)` |
| `ctx.waitUntil` (1×) | Hintergrundarbeit nach der Antwort | Promises sammeln und Fehler loggen; beim Herunterfahren abwarten |
| `caches.default` (9×, über `edgeCache()` und `cachedJsonResponse`) | Image-Proxy, Live-Snapshot, anonyme Turnierliste (60 s), Vereinsliste, anonyme Plätzeliste, Mietangebote (je 300 s), Cloudflare-Verbrauchsanzeige. `edgeCache()` toleriert schon `null` | Minimaler In-Memory-Cache (`match`/`put`/`delete`, TTL aus `Cache-Control`, Größenlimit) als globales `caches.default`. Ein Prozess, also wirkt `delete` sofort überall (heute nur im eigenen Rechenzentrum). Die Listen-Caches sind danach nur noch Beschleunigung, kein Kostenschutz |
| `env.REGISTRATION_OPENING_SCHEDULER` (Durable Object `RegistrationOpeningScheduler`, `src/registration-opening.js`) | Öffnet Anmeldungen zur Startzeit per Alarm, ohne Polling. Nutzt `ctx.storage.getAlarm/setAlarm/deleteAlarm/get/put/delete` und `ctx.blockConcurrencyWhile`. Aufgerufen per `stub.fetch` nach Turnier-Schreibzugriffen und im stündlichen Cron (`dirty`-Marker) | Die Klasse bleibt unverändert (bewusst ohne `cloudflare:workers`-Import). Nachbildung `server/durable-object.js`: eine Instanz, `storage` als Key-Value-Tabelle in SQLite, Alarm per `setTimeout` (bei langen Zeiten in Etappen, Node-Grenze etwa 24,8 Tage), Alarmzeit persistiert und beim Start neu gesetzt, abgelaufene Alarme sofort nachholen. `blockConcurrencyWhile` als einfacher Mutex. `get(idFromName())` liefert diese Instanz, `stub.fetch` ruft `instance.fetch()`. Vorlage: Storage-Mock in `src/registration-opening.test.js` |
| `ratelimits` `PLAYER_DETAILS_ACCOUNT_LIMIT` (6/60 s), `PLAYER_DETAILS_IP_LIMIT` (30/60 s) | Spielersuche bei der Anmeldung (`src/registration-player-search.js`, `.limit({ key })`), ohne Bindung 503 | `server/ratelimit.js`: Objekt mit `limit({ key })` → `{ success }`, festes Fenster im Speicher (Map mit Ablauf). Ein Prozess, daher exakter als bei Cloudflare |
| Cloudflare-Verbrauchsanzeige (`src/cloudflare-usage-core.js`, `/api/admin/cloudflare-usage`, Admin-Dashboard) | Liest Workers-/D1-Zahlen per GraphQL mit `CF_ACCOUNT_ID`/`CF_ANALYTICS_API_TOKEN` | Auf dem VPS ohne Aussage. `isCloudflareUsageConfigured` blendet sie aus, wenn die Secrets fehlen. Später ersetzen durch Server-Werte (Requests, Antwortzeit, DB-Größe, freier Platz) oder entfernen |
| `worker-mailer` (dynamischer Import, nutzt `cloudflare:sockets`) | Strato-SMTP über Port 465 | **`nodemailer`** (Standard-Bibliothek), gleiche Zugangsdaten. Resend läuft weiter per `fetch` und bleibt unverändert |
| `CF-Connecting-IP` (7×, auch `src/registration-player-search.js`) | Rate-Limits für Login, Registrierung, Spielersuche usw. | Unverändert: cloudflared reicht den Header weiter. Fälschen ist ausgeschlossen, weil die App nur an `127.0.0.1` lauscht |
| `nodejs_compat`, Web-APIs (`fetch`, `Request`, `crypto.subtle`, `atob`) | überall | In Node 24 nativ vorhanden |
| Secrets/Vars (`wrangler secret`, `vars`) | Konfiguration | `/etc/ptm/ptm.env` (root:ptm, 0640), als `EnvironmentFile` in systemd |
| Turnstile, Google-/Facebook-OAuth, VAPID, MapTiler | externe Dienste | Unverändert, die Domain bleibt gleich |

Benötigte Secrets (laut `wrangler secret list`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`MAPTILER_API_KEY`, `RESEND_API_KEY`, `STRATO_SMTP_PASSWORD`, `STRATO_SMTP_USER`,
`TURNSTILE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`,
`VISIT_HASH_SECRET` (Stand 2026-10-26). `CF_ACCOUNT_ID` und `CF_ANALYTICS_API_TOKEN` entfallen
auf dem VPS (siehe Verbrauchsanzeige).
Dazu die Vars aus `wrangler.jsonc`: `MAIL_FROM`, `STRATO_MAIL_FROM`, `TURNSTILE_SITE_KEY`.
Der Code liest außerdem optional `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`, `BASIC_AUTH_USER`/
`BASIC_AUTH_PASSWORD`, `STRATO_SMTP_HOST`/`STRATO_SMTP_PORT`. In Prod derzeit nicht gesetzt, nur
übernehmen, wenn sie bis zum Umzug dazukommen.
Die Secret-Werte kann `wrangler secret list` nicht auslesen. Sie müssen aus der eigenen Ablage
übernommen werden und gehören nie ins Repo.

## 4. Neue Dateien im Repo

Grundsatz: vorher prüfen, ob eine Standard-Bibliothek die Aufgabe abdeckt.

| Datei | Inhalt |
|---|---|
| `server/main.js` | Einstieg: Env aufbauen, HTTP-Server per **`@hono/node-server`** (Node-Request → Fetch-Request; nur der Adapter, nicht das Hono-Framework), Scheduler, Queue-Loop, sauberes Herunterfahren (SIGTERM) |
| `server/d1-sqlite.js` | D1-kompatibler Adapter auf `node:sqlite` (Node 24, ohne native Abhängigkeit, wie der Test-Shim). Alternative: `better-sqlite3`. PRAGMAs: `journal_mode=WAL`, `foreign_keys=ON` (wie D1; wichtig für die `ON DELETE CASCADE`-Logik), `busy_timeout=5000`, `synchronous=NORMAL` |
| `server/assets.js` | Static-Handler für `dist/` |
| `server/queue.js` | Job-Tabelle und Abarbeitung |
| `server/cache.js` | In-Memory-`caches.default` |
| `server/durable-object.js` | Nachbildung für `RegistrationOpeningScheduler`: Storage-Tabelle `do_storage` (key, value) und `do_alarm` in SQLite, Timer, Mutex, Stub mit `fetch` |
| `server/ratelimit.js` | Rate-Limiter mit `limit({ key })` für die beiden `PLAYER_DETAILS_*`-Bindungen |
| `server/migrate.js` | Wendet `migrations/*.sql` an und führt die Tabelle `d1_migrations` weiter, die Wrangler schon anlegt. Der D1-Export bringt diese Tabelle mit, also laufen nur neue Migrationen |
| `server/*.test.js` | Adapter-Tests. Zusätzlich die bestehenden Worker-Tests gegen den neuen Adapter laufen lassen |
| `deploy/ptm-online.service` | systemd-Unit mit Härtung: `User=ptm`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/ptm`, `NoNewPrivileges`, `Restart=always` |
| `deploy/ptm-backup.service` + `.timer` | Stündliches Backup |
| `deploy/cloudflared-config.yml` | Ingress `ptmonline.org` und `www.ptmonline.org` → `http://127.0.0.1:8787` |
| `scripts/deploy-vps.sh` | Build, Upload, Migration, Neustart (siehe Abschnitt 7) |

Mailversand: Die Mail-Logik in `src/worker.js` hinter eine kleine Funktion legen, die je nach
Laufzeit `worker-mailer` (Cloudflare) oder `nodemailer` (Node) nutzt. Solange der Worker als
Rückfallebene bleibt, müssen beide gehen. Danach `worker-mailer` entfernen.

Anzupassende bestehende Skripte:
- `scripts/backfill-usernames.mjs` nutzt `wrangler d1 execute --remote`. Es braucht eine Variante
  gegen die SQLite-Datei auf dem Server.
- `package.json`: neues `deploy:vps`. `deploy` (Wrangler) bleibt bis zum Abschalten des Workers.

## 5. Server einrichten (einmalig, etwa ½ Tag)

1. **Debian 13 minimal** beim Anbieter installieren, Login nur per SSH-Schlüssel.
   - `PermitRootLogin no`, `PasswordAuthentication no`.
   - Admin-Benutzer mit sudo und Dienstbenutzer `ptm` ohne Login anlegen.
2. **Pakete:** `unattended-upgrades` (automatische Sicherheitsupdates), `ufw`, `sqlite3`, `restic`,
   Node.js 24 LTS aus dem offiziellen NodeSource- oder Node-Repo (Debian liefert nur Node 20),
   `cloudflared` aus dem Cloudflare-Paketarchiv.
3. **Swap:** 2 GB Swap-Datei (`fallocate -l 2G /swapfile`, `mkswap`, `swapon`, Eintrag in
   `/etc/fstab`), `vm.swappiness=10`. Reserve für `npm ci` und Updates bei 2 GB RAM.
4. **Firewall:** `ufw default deny incoming`, nur `22/tcp` erlauben. Später kann auch SSH über den
   Tunnel laufen, dann ist kein Port mehr offen.
5. **Verzeichnisse:**
   - `/opt/ptm` (Code, root-eigen),
   - `/var/lib/ptm` (Datenbank, ptm-eigen),
   - `/etc/ptm/ptm.env` (Secrets).
6. **Tunnel:** `cloudflared tunnel login` und `cloudflared tunnel create ptm`, zunächst mit der
   Testadresse `neu.ptmonline.org`. Als systemd-Dienst installieren.
7. **Mail-Ports prüfen:** Manche Anbieter sperren ausgehend Port 25/465 für neue Kunden. Strato
   braucht 465. Vorab klären oder freischalten lassen. Resend (HTTPS) ist nicht betroffen.
8. **Überwachung:** kostenloser externer Check (z. B. UptimeRobot) auf
   `https://ptmonline.org/api/bootstrap`, mit Mail bei Ausfall. Logs über `journalctl -u ptm-online`.
9. **Backup:**
   - stündlich `sqlite3 /var/lib/ptm/ptm.sqlite ".backup /var/lib/ptm/backup/ptm.sqlite"`,
   - danach `restic backup` auf externen Speicher (z. B. Storage Box, Festpreis),
   - Aufbewahrung 48 stündliche, 30 tägliche und 12 monatliche Stände,
   - **Wiederherstellung einmal testen.**
   - Optional später Litestream für fortlaufende Replikation.
10. **Snapshot** des fertig eingerichteten Servers beim Anbieter anlegen.

## 6. Umsetzung im Code (etwa 2–3 Tage)

1. D1-Adapter mit Tests. Maßstab: Die bestehenden Worker-Tests laufen unverändert gegen den Adapter.
2. HTTP-Einstieg, Assets und Cache; lokal mit `node server/main.js` und kopierter
   D1-Exportdatei testen.
3. Queue und Scheduler mit Tests (Wiederholung, Abbruch nach 3 Versuchen, Cron-Zeiten in UTC).
   Durable-Object-Nachbildung mit Tests: Alarm feuert pünktlich, überlebt Neustart, verpasster
   Alarm wird nachgeholt, Fehler-Wiederholung mit Backoff. Rate-Limiter mit Tests (Fensterwechsel).
4. Mail-Abstraktion mit `nodemailer` und Testmail über Strato und Resend.
5. Migrations-Runner und Deploy-Skript.
6. `npm run quality-gate` muss weiterhin grün sein. Die neuen Dateien kommen in Lint und Coverage.
7. Browsertest gegen `neu.ptmonline.org`: Login (Passwort, Google), Anmeldung mit Bestätigungsmail,
   Postbox und Push, Live-Ansicht, PWA-Installation, Handy-Layout, Sync-API mit dem Desktop-Client.

## 7. Deploy-Ablauf auf dem VPS

```
lokal:  npm run quality-gate && npm run build
        rsync dist/ src/ server/ migrations/ package*.json → vps:/opt/ptm/releases/<git-sha>/
vps:    cd /opt/ptm/releases/<sha> && npm ci --omit=dev
        sqlite3 .backup (vor jeder Migration)
        node server/migrate.js
        ln -sfn releases/<sha> /opt/ptm/current && systemctl restart ptm-online
        Zeilenzahlen der Haupttabellen vor/nach vergleichen (wie bisher bei Remote-Migrationen)
```

- Der Neustart dauert etwa 1–2 Sekunden. Cloudflare zeigt in der Zeit kurz einen Fehler, das ist für
  diese Last akzeptabel.
- Rollback des Codes: Symlink auf das vorige Release und Neustart. Wurde schon migriert, das Backup
  von vor dem Deploy zurückspielen.
- Weiterhin gilt: deployen nur auf Anweisung und nur von `master` (`scripts/assert-deploy-branch.mjs`).
  D1-Regel sinngemäß: kein `DROP TABLE`-Rebuild.

## 8. Umschalten (Cutover)

Vorbereitung: Der VPS läuft fertig unter `neu.ptmonline.org` mit einer Testkopie der Daten.

1. **Zeitfenster** nachts wählen, z. B. 03:00 Uhr, wenn kein Turnier läuft. Vorher in den Kalender
   schauen.
2. **Schreibstopp auf Cloudflare:** eine WAF-Custom-Rule (Free-Plan) blockt alle Nicht-GET-Requests
   auf `/api/*`. Lesen geht weiter.
3. **Export:** `wrangler d1 export petanque-turnier-manager-online --remote --output ptm-dump.sql`.
4. **Import auf dem VPS:**
   - `sqlite3 ptm.sqlite < ptm-dump.sql`,
   - danach `PRAGMA foreign_key_check;` und `PRAGMA integrity_check;`,
   - Zeilenzahlen aller Tabellen mit D1 vergleichen,
   - `node server/migrate.js`, das sollte nichts mehr anwenden.
5. **DNS umstellen:**
   - im Worker die Custom Domains `ptmonline.org` und `www.ptmonline.org` entfernen (`routes` in
     `wrangler.jsonc` beziehungsweise Dashboard),
   - `cloudflared tunnel route dns ptm ptmonline.org` und `www.ptmonline.org`.

   Das wirkt sofort, die Nameserver liegen bei Cloudflare.
6. **Schreibstopp-Regel entfernen.** Rauchtest: Login, Turnierliste, Anmeldung, Mail.
7. Die Pausierung der Worker-Crons (`triggers.crons`) ist Teil des Umschaltens. Sonst schickt der
   alte Worker weiter Erinnerungen aus der alten D1.
8. Ebenso den **Alarm des Durable Objects** stilllegen: Er feuert unabhängig von Crons und Requests
   und würde in der alten D1 Anmeldungen öffnen und Push-Nachrichten verschicken. Vor dem Umschalten
   einen Worker-Stand ohne `REGISTRATION_OPENING_SCHEDULER`-Bindung deployen oder den Alarm per
   `deleteAlarm` löschen. Auf dem VPS danach einmal `synchronizeOpeningSchedule` auslösen (der
   stündliche Cron tut das über den `dirty`-Marker, sonst einmal manuell), damit anstehende
   Öffnungen geplant sind. Prüfen: Turniere mit `registration_opening_pending = 1` und naher
   Öffnungszeit.

Die Ausfallzeit für Schreibzugriffe liegt bei etwa 10–15 Minuten, Lesen bleibt durchgehend möglich.

**Rückfallebene:** Worker und D1 bleiben 1–2 Wochen bestehen, ohne Crons. Zurückschalten heißt:
Tunnel-Route entfernen und Custom Domain wieder auf den Worker legen. Daten, die seit dem Umschalten
auf dem VPS geschrieben wurden, müssten dann per SQL-Dump zurück nach D1 (`wrangler d1 execute --file`).
Deshalb nur im echten Notfall.

**Abschluss:** Nach 2 Wochen ohne Probleme:
- Worker, D1, Queues und Durable-Object-Namespace löschen,
- `wrangler`, `worker-mailer` und `wrangler.jsonc` entfernen,
- Secrets `CF_ACCOUNT_ID`/`CF_ANALYTICS_API_TOKEN` und den Token in der `.bashrc` widerrufen,
  sofern Phase 2 folgt (für den Tunnel bleibt der Account),
- Doku anpassen: README, CLAUDE.md, die Memory-Regeln zu D1 und `npm run deploy`.

## 9. Domain

- `ptmonline.org` ist bei Cloudflare Registrar registriert, mit Cloudflare-Nameservern, gültig bis
  2027-09-02. Die automatische Verlängerung im Dashboard prüfen.
- Es ändern sich nur die Einträge für `ptmonline.org` und `www`: von Worker Custom Domain auf
  Tunnel-CNAME.
- Mail-DNS (SPF/DKIM/DMARC für Resend und Strato), E-Mail-Weiterleitung und WAF bleiben unverändert.

## 10. Kosten

| Posten | Kosten |
|---|---|
| VPS S (1 vCore, 2 GB, 60 GB NVMe) | etwa 4 € pro Monat, Festpreis (VPS M wäre etwa 10 €) |
| Backup-Speicher (z. B. Storage Box) | etwa 3–4 € pro Monat, Festpreis |
| Cloudflare (DNS, Proxy, WAF, Tunnel) | 0 € (Free) |
| Domain | unverändert, jährlich beim Registrar |

**Summe etwa 7–8 € pro Monat.** Zum Vergleich: Cloudflare Workers Paid etwa 5–6 € (5 USD + USt), aber
ohne Kostenobergrenze bei Fehlern (siehe `guard-cloudflare.md`).

Keine Kosten nach Verbrauch. Bei Überlast wird der Server langsamer, es entstehen keine Mehrkosten.

## 11. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Server fällt aus (Hardware, Absturz) | `Restart=always`, externer Uptime-Check, Snapshot und Backup für Neuaufbau in unter 1 h |
| Datenverlust | stündliches Backup nach außen, getestete Wiederherstellung, Backup vor jeder Migration |
| Sicherheitslücken | `unattended-upgrades`, kein offener Port außer SSH (nur Schlüssel), Dienstbenutzer, systemd-Härtung |
| Unterschiede D1 ↔ SQLite (Fehlertexte, `meta`, Fremdschlüssel) | Adapter-Tests, bestehende Worker-Tests gegen den Adapter, `foreign_keys=ON` |
| Mail-Port 465 gesperrt | vorab beim Anbieter klären; Resend als Weg bleibt |
| Plattenplatz voll (Logs, Backups) | journald-Limit, restic-Aufbewahrung, Platten-Check im Monitoring |
| Wartung bleibt liegen | Updates automatisch; monatliche Checkliste (Backups, freier Platz, Node-LTS-Stand) |

## 12. Aufwand

| Schritt | Aufwand |
|---|---|
| Server einrichten | ½ Tag |
| Adapter (DB, Assets, Cache), HTTP-Einstieg | 1 Tag |
| Queue, Scheduler, Mail auf `nodemailer` | ½–1 Tag |
| Durable-Object-Nachbildung, Rate-Limiter (neu seit 10/2026) | ½–1 Tag |
| Migrations-Runner, Deploy-Skript, Backup | ½ Tag |
| Tests, Browsertest, Umschalten | 1 Tag |
| **Summe** | **etwa 4–5 Tage** |

Jede weitere Cloudflare-Bindung bis zum Umzug erhöht den Aufwand. Neue Funktionen deshalb möglichst
ohne zusätzliche Bindungen bauen (z. B. Zeitsteuerung über DB + Cron statt weiterer Durable Objects).

### Was nach dem Umzug wegfallen kann

Nicht Teil der Migration, erst danach und nur bei Bedarf:
- Edge-Cache-Workarounds und Cache-Invalidierung für Listen (`cachedJsonResponse`), die nur
  D1-Lesezeilen sparen. Kann bleiben, schadet nicht.
- Offene Optimierungen in `docs/plaetze-karte-todo.md` (Plätzeliste aufteilen, längere TTL).
- Arbeitsbudgets gegen das 10-ms-CPU-Limit (z. B. Supermêlée-Auslosung) dürfen großzügiger werden.
- Durable Object: Die Nachbildung könnte durch einen schlichten Timer im Prozess ersetzt werden.
- Die Memory-/Projekt-Regeln zu D1-Limits und Free-Plan anpassen.

## 13. Offene Entscheidungen

- Anbieter. Tarif: VPS S (entschieden 2026-10-26). Mail-Ports, Snapshot-Funktion und Upgrade ohne
  Neuinstallation vorab klären.
- `node:sqlite` (wie Tests) oder `better-sqlite3` (ausgereifter) für den Betrieb.
- Backup-Ziel: Storage Box, S3-kompatibler Speicher oder anderes.
- Ob SSH ebenfalls über den Tunnel laufen soll (dann kein offener Port).
- Zeitpunkt des Umschaltens, nicht an einem Turniertag.

## 14. Phase 2 (optional): komplett ohne Cloudflare

**Voraussetzung:** Phase 1 läuft stabil. Phase 2 löst kein Kostenproblem: DNS, Proxy, WAF, Tunnel und
Turnstile sind im Cloudflare-Free-Plan kostenlos und werden nie nach Verbrauch abgerechnet. Ziel ist nur
volle Unabhängigkeit von einem Anbieter und weniger Datenfluss über Dritte.

### 14.1 Was ersetzt werden muss

| Dienst heute | Ersatz | Aufwand |
|---|---|---|
| Domain bei Cloudflare Registrar | Transfer zu einem anderen Registrar (z. B. INWX, Netcup, Hetzner). **Frühestens ab etwa 2026-11-01**, wegen der ICANN-Sperre von 60 Tagen nach der Registrierung am 2026-09-02 | ½ h plus bis zu 5 Tage Transferzeit |
| DNS (Cloudflare-Nameserver) | DNS beim neuen Registrar oder VPS-Anbieter. Alle Einträge übernehmen, besonders die Resend-Einträge (`send.ptmonline.org`: SPF `include:amazonses.com`, DKIM `resend._domainkey`, ggf. MX/DMARC) | 1 h |
| Tunnel und HTTPS am Rand | **Caddy** auf dem VPS mit automatischem Let's-Encrypt-Zertifikat, Reverse Proxy auf `127.0.0.1:8787`, `www` leitet auf die Hauptdomain weiter. Firewall: Ports 80 und 443 öffnen | 1 h |
| WAF, Rate-Limit, DDoS-Schutz | Rate-Limit in Caddy (Modul `caddy-ratelimit`) oder fail2ban auf das Caddy-Log, plus die App-eigenen Limits. Volumetrische DDoS-Angriffe fängt nur der Basisschutz des VPS-Anbieters ab, vorher klären, was enthalten ist | ½ Tag |
| Turnstile (Bot-Schutz bei Turnier- und Platzmeldungen: `createTournamentReport`, `createPlaceReport`; Frontend in `TournamentReportPage.jsx`, `PlaceReportPage.jsx`, `App.jsx`) | **ALTCHA** (Open Source, Proof-of-Work, läuft auf dem eigenen Server ohne Fremddienst) oder Friendly Captcha. Anpassen: `verifyTurnstileToken` → Prüfung des neuen Tokens, Widget im Frontend, `turnstileSiteKey` in `/api/bootstrap`, CSP ohne `challenges.cloudflare.com` (`SECURITY_HEADERS`), Tests, i18n | ½–1 Tag |
| Absender-IP `CF-Connecting-IP` (7×: Rate-Limits) | Echte Client-IP aus `X-Forwarded-For`, die Caddy setzt. Nur von `127.0.0.1` vertrauen, sonst ließe sich der Header fälschen. Am besten an einer Stelle als `clientIp(request)` bündeln | 1 h |
| Cloudflare-Account | Nach dem Umzug: Zone, Worker, D1, Queues, Tunnel und API-Tokens löschen. Token aus der `.bashrc` entfernen | ½ h |

Eine E-Mail-Weiterleitung über Cloudflare läuft für die Hauptdomain nicht: Es gibt keinen MX-Eintrag
auf `ptmonline.org`, Stand 2026-10-09. Vor dem Transfer im Dashboard unter „E-Mail-Weiterleitung“
nochmals prüfen.

**Zusatzaufwand Phase 2:** etwa 1½–2 Tage.

### 14.2 Ablauf

1. **Vorbereitung im Code**, deploybar noch mit Cloudflare davor:
   - `clientIp(request)` mit Fallback-Reihenfolge `CF-Connecting-IP` → `X-Forwarded-For` (nur von localhost),
   - Captcha austauschen, ALTCHA statt Turnstile, inklusive CSP, Tests und Locales.

   Danach hängt der Code nicht mehr an Cloudflare.
2. **Caddy einrichten** und unter einer Testadresse mit eigenem A-Record prüfen, z. B. Testsubdomain
   auf die VPS-IP mit Proxy „aus“ (graue Wolke).
3. **DNS-Einträge** beim neuen Anbieter vollständig anlegen: A/AAAA für `ptmonline.org` und `www` auf
   die VPS-IP, alle Mail-Einträge. Vorher die TTLs bei Cloudflare auf 300 s senken.
4. **Umschalten auf direkt:** Bei Cloudflare den Proxy für `ptmonline.org`/`www` ausschalten und die
   A-Records auf die VPS-IP setzen. Ab jetzt beantwortet Caddy die Anfragen. Den Tunnel stoppen.
5. **Domain-Transfer:**
   - Bei Cloudflare den Auth-Code holen und die Transfersperre aufheben.
   - Beim neuen Registrar den Transfer starten und dort die Nameserver auf dessen DNS setzen.
   - Weil die Einträge bereits identisch angelegt sind, gibt es keinen Ausfall.
6. **Prüfen:**
   - Zertifikat, `www`-Weiterleitung, Login (Google-OAuth: Redirect-URI unverändert, weil die
     Domain gleich bleibt),
   - Mailversand über Resend mit SPF/DKIM-Prüfung, z. B. per mail-tester.com,
   - Captcha, Push.
7. **Aufräumen:** Cloudflare-Zone und Account-Ressourcen löschen, Firewall-Regeln anpassen.
   Doku anpassen: README, SECURITY.md, Datenschutzerklärung (Cloudflare als Auftragsverarbeiter
   entfällt).

### 14.3 Abwägung

| | Phase 1 (Cloudflare Free davor) | Phase 2 (ohne Cloudflare) |
|---|---|---|
| Kostenrisiko | 0 | 0 |
| Server-IP | verborgen, kein offener Port | öffentlich, Ports 80/443 offen |
| DDoS-Schutz | Cloudflare | nur Basisschutz des VPS-Anbieters |
| Bot-Schutz | Turnstile | ALTCHA (selbst gehostet) |
| Cache für statische Dateien | weltweit | nur vom VPS (bei dieser Last unerheblich) |
| Domain | Selbstkostenpreis | meist einige Euro pro Jahr mehr |
| Abhängigkeit | Cloudflare für DNS, Proxy, Captcha | keine |
| Datenschutz | Besucherdaten laufen über Cloudflare (USA) | nur VPS-Anbieter |

**Empfehlung:** Phase 2 nur angehen, wenn Unabhängigkeit oder Datenschutz das Ziel ist. Für das
Kostenproblem reicht Phase 1. Schritt 1 (Code ohne Cloudflare-Bindung) lässt sich unabhängig davon
jederzeit vorziehen.
