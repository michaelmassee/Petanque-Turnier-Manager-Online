# Migrationsplan: Cloudflare Workers + D1 → VPS

Stand: 2026-10-09. Status: **Plan, nicht begonnen.** Phase 1 (Abschnitte 1–13): weg von Workers + D1, Cloudflare Free bleibt als DNS/Proxy/Tunnel. Phase 2 (Abschnitt 14, optional): komplett ohne Cloudflare. Hintergrund und Kostenanalyse siehe `guard-cloudflare.md`.

## 1. Ziel

- **Feste Kosten statt Abrechnung nach Verbrauch:** Last soll Performance kosten, nie Geld, und nie
  einen Totalausfall wie am 08.10. (D1-Free-Limit) verursachen.
- **Möglichst wenig Code-Änderung:** `src/worker.js` bleibt ein Fetch-Handler. Die
  Cloudflare-Bindungen werden auf dem Server nachgebildet.
- **Cloudflare bleibt davor:** DNS, Proxy, WAF und DDoS-Schutz im Free-Plan, ohne Abrechnung nach
  Verbrauch, angebunden per Cloudflare Tunnel.

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
  │    └─ caches.default  → kleiner In-Memory-Cache (Image-Proxy, Live-Snapshot)
  └─ Backup (systemd-Timer): sqlite3 .backup → restic → externer Speicher
```

Server: 2 vCores, 4 GB RAM, 120 GB NVMe. Geschätzter Bedarf: etwa 300–400 MB RAM und unter 5 GB
Platte. Kapazität geschätzt 500–2.000 einfache Requests pro Sekunde, gegenüber heute etwa
0,1 Requests pro Sekunde im Schnitt und wenige Requests pro Sekunde am Turniertag.

## 3. Bestandsaufnahme: Cloudflare-Abhängigkeiten im Code

| Stelle | Nutzung | Ersatz auf dem VPS |
|---|---|---|
| `env.DB` (409×) | D1-API: `prepare().bind().first/all/run`, `batch` | **D1-Adapter** über SQLite. Vorlage `src/test-support/d1.js`, für den Betrieb ausbauen: `meta` (changes, last_row_id, rows_read/rows_written), `batch` als Transaktion, `first(column)`, Fehlermeldungen wie D1 |
| `env.ASSETS` (1×) | SPA aus `dist/` | Static-Handler mit SPA-Fallback auf `index.html` und korrektem `Content-Type`; Cache-Header für `/assets/*` (immutable) |
| `env.MAIL_QUEUE` (4×, `send`/`sendBatch`) + `queue`-Handler | Mail- und Push-Versand entkoppelt, `max_retries: 3`, DLQ | Tabelle `queue_jobs` (id, body, attempts, run_after, failed_at). Abarbeitung im Prozess (Intervall 5 s, Batch 3) ruft den bestehenden `queue(batch, env)` mit `messages[].body/ack()/retry()` auf. Nach 3 Fehlversuchen `failed_at` setzen, das entspricht der DLQ |
| `scheduled` + `triggers.crons` | `0 * * * *`, `0 1 * * *` | In-Process-Scheduler mit `croner` (UTC), ruft `worker.scheduled({ cron }, env, ctx)` |
| `ctx.waitUntil` (1×) | Hintergrundarbeit nach der Antwort | Promises sammeln und Fehler loggen; beim Herunterfahren abwarten |
| `caches.default` (3×) | Image-Proxy (`src/worker.js` ~5570), Live-Snapshot (~6414, toleriert schon `null`) | Minimaler In-Memory-Cache (`match`/`put`/`delete`, TTL aus `Cache-Control`, Größenlimit) als globales `caches.default` |
| `worker-mailer` (dynamischer Import, nutzt `cloudflare:sockets`) | Strato-SMTP über Port 465 | **`nodemailer`** (Standard-Bibliothek), gleiche Zugangsdaten. Resend läuft weiter per `fetch` und bleibt unverändert |
| `CF-Connecting-IP` (4×) | Rate-Limits für Login, Registrierung usw. | Unverändert: cloudflared reicht den Header weiter. Fälschen ist ausgeschlossen, weil die App nur an `127.0.0.1` lauscht |
| `nodejs_compat`, Web-APIs (`fetch`, `Request`, `crypto.subtle`, `atob`) | überall | In Node 24 nativ vorhanden |
| Secrets/Vars (`wrangler secret`, `vars`) | Konfiguration | `/etc/ptm/ptm.env` (root:ptm, 0640), als `EnvironmentFile` in systemd |
| Turnstile, Google-/Facebook-OAuth, VAPID, MapTiler | externe Dienste | Unverändert, die Domain bleibt gleich |

Benötigte Secrets (laut `wrangler secret list`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`MAPTILER_API_KEY`, `RESEND_API_KEY`, `STRATO_SMTP_PASSWORD`, `STRATO_SMTP_USER`,
`TURNSTILE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`.
Dazu die Vars aus `wrangler.jsonc`: `MAIL_FROM`, `STRATO_MAIL_FROM`, `TURNSTILE_SITE_KEY`.
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
3. **Firewall:** `ufw default deny incoming`, nur `22/tcp` erlauben. Später kann auch SSH über den
   Tunnel laufen, dann ist kein Port mehr offen.
4. **Verzeichnisse:**
   - `/opt/ptm` (Code, root-eigen),
   - `/var/lib/ptm` (Datenbank, ptm-eigen),
   - `/etc/ptm/ptm.env` (Secrets).
5. **Tunnel:** `cloudflared tunnel login` und `cloudflared tunnel create ptm`, zunächst mit der
   Testadresse `neu.ptmonline.org`. Als systemd-Dienst installieren.
6. **Mail-Ports prüfen:** Manche Anbieter sperren ausgehend Port 25/465 für neue Kunden. Strato
   braucht 465. Vorab klären oder freischalten lassen. Resend (HTTPS) ist nicht betroffen.
7. **Überwachung:** kostenloser externer Check (z. B. UptimeRobot) auf
   `https://ptmonline.org/api/bootstrap`, mit Mail bei Ausfall. Logs über `journalctl -u ptm-online`.
8. **Backup:**
   - stündlich `sqlite3 /var/lib/ptm/ptm.sqlite ".backup /var/lib/ptm/backup/ptm.sqlite"`,
   - danach `restic backup` auf externen Speicher (z. B. Storage Box, Festpreis),
   - Aufbewahrung 48 stündliche, 30 tägliche und 12 monatliche Stände,
   - **Wiederherstellung einmal testen.**
   - Optional später Litestream für fortlaufende Replikation.
9. **Snapshot** des fertig eingerichteten Servers beim Anbieter anlegen.

## 6. Umsetzung im Code (etwa 2–3 Tage)

1. D1-Adapter mit Tests. Maßstab: Die bestehenden Worker-Tests laufen unverändert gegen den Adapter.
2. HTTP-Einstieg, Assets und Cache; lokal mit `node server/main.js` und kopierter
   D1-Exportdatei testen.
3. Queue und Scheduler mit Tests (Wiederholung, Abbruch nach 3 Versuchen, Cron-Zeiten in UTC).
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

Die Ausfallzeit für Schreibzugriffe liegt bei etwa 10–15 Minuten, Lesen bleibt durchgehend möglich.

**Rückfallebene:** Worker und D1 bleiben 1–2 Wochen bestehen, ohne Crons. Zurückschalten heißt:
Tunnel-Route entfernen und Custom Domain wieder auf den Worker legen. Daten, die seit dem Umschalten
auf dem VPS geschrieben wurden, müssten dann per SQL-Dump zurück nach D1 (`wrangler d1 execute --file`).
Deshalb nur im echten Notfall.

**Abschluss:** Nach 2 Wochen ohne Probleme:
- Worker und D1 löschen,
- `wrangler`, `worker-mailer` und `wrangler.jsonc` entfernen,
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
| VPS (2 vCores, 4 GB, 120 GB NVMe) | Festpreis laut Angebot, etwa 4–8 € pro Monat |
| Backup-Speicher (z. B. Storage Box) | etwa 3–4 € pro Monat, Festpreis |
| Cloudflare (DNS, Proxy, WAF, Tunnel) | 0 € (Free) |
| Domain | unverändert, jährlich beim Registrar |

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
| Migrations-Runner, Deploy-Skript, Backup | ½ Tag |
| Tests, Browsertest, Umschalten | 1 Tag |
| **Summe** | **etwa 3½–4 Tage** |

## 13. Offene Entscheidungen

- Anbieter und genauer Tarif. Mail-Ports und Snapshot-Funktion vorab klären.
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
| Absender-IP `CF-Connecting-IP` (4×: Rate-Limits) | Echte Client-IP aus `X-Forwarded-For`, die Caddy setzt. Nur von `127.0.0.1` vertrauen, sonst ließe sich der Header fälschen. Am besten an einer Stelle als `clientIp(request)` bündeln | 1 h |
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
