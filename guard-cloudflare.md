# Kosten- und Kontingent-Guards für Cloudflare

Stand: 2026-10-09. Status: **Plan, nicht umgesetzt.** Ein erster Code-Entwurf wurde wieder zurückgenommen;
er steht im Anhang, damit er bei Bedarf wiederverwendet werden kann.

## 1. Ausgangslage

- Am Abend des 2026-10-08 lieferte Produktion Serverfehler. Ursache: Das D1-Free-Limit von
  5 Mio. gelesenen Zeilen pro Tag war überschritten (5.589.657). Die Turnierliste berechnete das
  Vereinslogo des Spielorts bei jedem Abruf per Unterabfrage ohne Index (~19.000 Zeilen pro Aufruf).
- Behoben am 2026-10-09 (Commits 7f915fa, 64a94ce, e0a044c): Logo per Trigger beim Schreiben
  (Migration 0099), Postbox-Polling nur noch Badge-Zahlen, Teilindizes für Anmeldungen (Migration 0100).
- Grundsatzfrage danach: Wie verhindert man, dass ein Fehler im Code oder hohe Last
  - im **Free-Plan** die Seite bis 00:00 UTC lahmlegt bzw.
  - im **Paid-Plan** unbegrenzt Kosten verursacht?

  Vorgabe: Last darf Performance kosten, aber kein Geld.

## 2. Messwerte (GraphQL-Analytics, ganzes Konto)

| Tag | Worker-Requests (Free-Limit 100.000) | D1 gelesen (Limit 5 Mio.) | D1 geschrieben (Limit 100.000) |
|---|---:|---:|---:|
| 03.10. | 7.817 | 984.404 | 393 |
| 04.10. | 4.502 | 378.559 | 517 |
| 05.10. | 4.738 | 433.696 | 413 |
| 06.10. | 5.435 | 548.804 | 324 |
| 07.10. | 6.933 | 4.173.149 | 2.178 |
| **08.10.** | 6.969 | **5.589.657** (Ausfall) | 412 |
| 09.10. (bis ~10 Uhr, nach den Fixes) | 2.128 | 409.753 | 527 |

Nach den Fixes liegt der Verbrauch bei etwa 8 % der Free-Limits (rund 12-fache Reserve).

Abfrage (funktioniert mit dem Token aus der `.bashrc`, Recht „Account Analytics: Read“):

```graphql
query($account: String!, $date: Date!) { viewer { accounts(filter: { accountTag: $account }) {
  workers: workersInvocationsAdaptive(limit: 10000, filter: { date: $date }) { sum { requests } }
  d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date: $date }) { sum { rowsRead rowsWritten } }
} } }
```

## 3. Preise und Limits (belegt)

Quellen: <https://developers.cloudflare.com/d1/platform/pricing/>,
<https://developers.cloudflare.com/workers/platform/pricing/>, Dashboard „Pläne für Workers“.

| | Free | Paid (min. 5 USD/Monat + Nutzung) |
|---|---|---|
| Worker-Requests | 100.000 / Tag | 10 Mio. / Monat inkl., dann 0,30 $ / Mio. |
| CPU-Zeit | 10 ms / Aufruf | 30 Mio. ms / Monat inkl., dann 0,02 $ / Mio. ms |
| D1 gelesene Zeilen | 5 Mio. / Tag | 25 Mrd. / Monat inkl., dann 0,001 $ / Mio. |
| D1 geschriebene Zeilen | 100.000 / Tag | 50 Mio. / Monat inkl., dann 1,00 $ / Mio. |
| D1 Speicher | 5 GB | 5 GB inkl., dann 0,75 $ / GB-Monat |
| Workers Logs | 200.000 / Tag | 20 Mio. / Monat inkl., dann 0,60 $ / Mio. |
| Cron-Trigger | 5 | 250 |

- Free: Bei erreichtem D1-Tageslimit „you will not be able to run queries against D1“ bis 00:00 UTC.
- Paid: **keine Ausgabenobergrenze** dokumentiert; nur Budget-Warnungen (Mail) im Dashboard.
- Preise in USD zzgl. USt.
- Workers Logs kosten nichts: `observability` ist in `wrangler.jsonc` nicht aktiviert.

## 4. Risikoabschätzung ohne Guards (Paid-Plan)

Eigene Schätzung auf Basis der Preise oben.

| Szenario | Wahrscheinlichkeit | Mehrkosten/Monat, wenn unbemerkt |
|---|---|---|
| Teure Lese-Query (wie 08.10.) | hoch (passiert) | ~0 $ (5,6 Mio./Tag < 1 % des Inklusivvolumens) |
| Frontend-Endlosschleife (React-Effect) | mittel | ~50–150 $ |
| Schreib-Endlosschleife (Cron/Queue/Trigger) | gering | mehrere hundert bis über 2.000 $ |
| Bot-Angriff, 100 Mio. Requests | gering | ~50 $ |

Im Free-Plan kostet jedes Szenario 0 $, führt aber zum Ausfall bis 00:00 UTC.

Fremdberichte über solche Schleifen: 4.868 $ (cf-monitor-Autor), 36.000 $
(<https://ppc.land/developer-faces-36-000-cloudflare-bill-after-queue-loop-post-says/>).

## 5. Plan: vier Schutzebenen

Prinzip: **Mehrkosten = Kostenrate × Dauer**, und nur der Teil über dem Inklusivvolumen.
Ebene 1 und 2 begrenzen die Rate, Ebene 3 und 4 die Dauer.

### Ebene 1 – WAF-Rate-Limit vor dem Worker (Standard, kein Code)

- Cloudflare-Regel auf der Zone `ptmonline.org`, z. B. mehr als 100 Requests / 10 s pro IP auf `/*` → Block.
- Geblockte Requests erreichen den Worker nicht und zählen weder als Request noch kosten sie.
- Fängt Frontend-Schleifen und einfache Bots ab, nicht aber verteilte Angriffe.
- Free-Plan enthält eine Rate-Limit-Regel. `workers_dev: false` ist schon gesetzt, `*.workers.dev`
  umgeht die Regel also nicht.
- Muss vom Account-Inhaber im Dashboard angelegt werden (Sicherheitseinstellung).

### Ebene 2 – Zeilen-Grenze pro Aufruf (Code)

- An den Einstiegen `fetch`, `scheduled`, `queue` wird `env.DB` durch einen Wrapper ersetzt, der
  `meta.rows_read` / `meta.rows_written` jeder Antwort aufsummiert.
- Bei Überschreitung bricht der Aufruf mit 503 ab, und der Vorfall wird gezählt, damit die Admins
  benachrichtigt werden.
- `first()` liefert in D1 keine `meta`, daher intern über `all()` (D1 führt bei `first()` ohnehin die
  ganze Abfrage aus).
- Entwurfsgrenzen:

  | Aufruf | Gelesen | Geschrieben |
  |---|---:|---:|
  | Request | 50.000 | 5.000 |
  | Cron | 500.000 | 20.000 |
  | Queue-Batch | 20.000 | 1.000 |

  Die teuerste normale Abfrage liest heute einige hundert Zeilen.
- Im Paid-Plan zusätzlich `limits.cpu_ms` in `wrangler.jsonc`. Im Free-Plan ist die CPU-Grenze ohnehin
  fest bei 10 ms.
- Die Mail-Queue ist schon begrenzt (`max_retries: 3` plus Dead-Letter-Queue).

### Ebene 3 – Tagesbudget-Wächter (Code)

- Neuer Cron `* * * * *` (dritter von 5 im Free-Plan). Er fragt den Tagesverbrauch des Kontos per
  GraphQL ab (siehe Abschnitt 2). Das kostet keine D1-Zeilen, nur etwa 1.440 Aufrufe pro Tag
  (~1,4 % des Free-Request-Limits).
- Betriebsstufe nach dem höchsten Anteil über alle Kennzahlen:

  | Anteil | Stufe | Wirkung |
  |---|---|---|
  | < 70 % | 0 normal | alles läuft |
  | ≥ 70 % | 1 Sparmodus | Polling und Zusatzfunktionen aus: Postbox-Summary/Empfänger, Geocode, gespeicherte Suchen, Benutzername-Prüfung, Admin-Statistik, Pétanque-Aktuell-Import |
  | ≥ 90 % | 2 kritisch | nur noch bootstrap/session/login/logout, auth, Turniere, Anmeldungen, Live, Sync, Admin |

- Gesperrte Routen antworten mit 503, `Retry-After` und `details.code: 'budget_restricted'`.
- Die Stufe steht in einer Einzeilentabelle `budget_state` (neue Migration, kein Table-Rebuild).
- Der Worker liest die Stufe pro Isolate höchstens einmal pro Minute. Bei einem Lesefehler gilt
  Normalbetrieb (fail open).
- Der Wächter schreibt nur bei Änderung.
- Die Admins bekommen eine Postbox-Systemnachricht mit Push bei:
  - einem Stufenwechsel,
  - einem abgebrochenen Aufruf (Ebene 2),
  - fehlschlagender Analytics-Abfrage (höchstens alle 6 h).
- Reset automatisch: Um 00:00 UTC beginnt ein neuer Analytics-Tag.
- Budgets konfigurierbar über `vars` in `wrangler.jsonc`: `BUDGET_DAILY_REQUESTS`,
  `BUDGET_DAILY_ROWS_READ`, `BUDGET_DAILY_ROWS_WRITTEN`.
  - Free: 100.000 / 5.000.000 / 100.000.
  - Paid: 80 % von Inklusivvolumen ÷ 31, also 258.000 / 645 Mio. / 1,29 Mio. Damit bleibt der Monat
    rechnerisch unter dem Inklusivvolumen und verursacht **0 $ Mehrkosten**; die restlichen 20 %
    puffern die Reaktionszeit von 1–6 Minuten.
- Frontend: API-Antworten tragen bei Stufe > 0 den Header `X-PTM-Budget`. Ein Hinweisbanner (i18n) wird
  wie `OfflineNotice` angezeigt, und das Postbox-Polling pausiert.
- Benötigt die Secrets `CF_ANALYTICS_API_TOKEN` (nur „Account Analytics: Read“) und die Variable
  `CF_ACCOUNT_ID`. Ohne Token ist der Wächter aus.

### Ebene 4 – Notbremse (nur Paid)

- Auch eine 503-Antwort des Workers ist ein berechneter Aufruf. Die echte Notbremse ist daher eine
  WAF-Sperrregel, die der Wächter per API ein- und um 00:00 UTC wieder ausschaltet. Ab dann ist die
  Kostenrate exakt 0.
- Weil `run_worker_first: true` gilt, muss die Sperre alle Pfade abdecken.
- Benötigt zusätzlich „Zone WAF: Edit“ auf dem Token.
- Im Free-Plan entfällt sie: Dort wäre die Sperre selbst der Ausfall.

### Zweite Linie (Standard, kein Code)

- Abrechnungswarnung im Dashboard, z. B. ab 1 $ Nutzungskosten.

## 6. Weitere Einsparung: statische Dateien am Worker vorbei

- `wrangler.jsonc` setzt `"run_worker_first": true`. Damit ist **jede** Datei (JS, CSS, Bilder) ein
  Worker-Request und zählt gegen die 100.000 pro Tag.
- Grund war Basic Auth. Die ist in Produktion nicht aktiv: Es gibt kein `BASIC_AUTH_*`-Secret.
- Vorschlag: `"run_worker_first": ["/*", "!/assets/*", "!/icons/*"]`. HTML, `/api/*`, `/q/*` und die
  `www`-Weiterleitung laufen weiter durch den Worker (CSP und weitere Security-Header bleiben). Die
  gehashten Vite-Bundles und die Icons liefert Cloudflare direkt aus, unbegrenzt und kostenlos.
  - `X-Content-Type-Options: nosniff` und `Cross-Origin-Resource-Policy: same-origin` für diese Pfade
    über `public/_headers` setzen.
  - Vorher prüfen, ob Wrangler 4.148 negative Muster unterstützt, und im Browser testen.

## 7. Standard-Bibliotheken – Recherche

| Baustein | Art | Bewertung |
|---|---|---|
| WAF-Rate-Limit-Regel | Cloudflare, kein Code | **nutzen** (Ebene 1) |
| Budget-Warnungen im Dashboard | Cloudflare, kein Code | **nutzen** (zweite Linie); nur Mail, kein Abschalten |
| Workers Rate Limiting Binding (`ratelimits`) | Cloudflare-API | optional; zählt nur pro Rechenzentrum, „eventually consistent“, kein Abrechnungszähler |
| Harte Ausgabengrenze | – | gibt es bei Cloudflare nicht |
| [cf-monitor](https://github.com/littlebearapps/cf-monitor) (`@littlebearapps/cf-monitor`, MIT, v0.3.11, Stand 2026-05) | Fremdbibliothek | macht genau das (D1-Zählung pro Aufruf, Tages-/Monatsbudgets, Circuit Breaker), passt aber schlecht, siehe unten |
| [sendcap](https://github.com/jimdc/sendcap) | Mini-Funktion | generischer Ausgabenzähler, nimmt keine Arbeit ab |
| Kill-Switch-Muster (Pylon-Doku) | Beschreibung | KV-Flag plus externer Wächter, entspricht Ebene 3 und 4 |

Warum cf-monitor nicht:

- Vor Version 1.0; laut README sind Teile noch Platzhalter.
- Braucht einen eigenen Monitor-Worker, KV, Analytics Engine und `tail_consumers`. Tail Workers gibt es
  vermutlich nur im Paid-Plan (nicht geprüft).
- Breaker-Zustand liegt in KV; der Free-Plan erlaubt dort nur 1.000 Schreibvorgänge pro Tag.
- Das Token braucht u. a. „Workers Scripts: Edit“ (weitreichend).
- Prüft nur alle 15 Minuten.
- Für einen späteren Paid-Plan mit Wunsch nach mehr Überwachung neu bewerten.

## 8. Empfehlung und offene Entscheidung

1. Ohne Code, sofort: WAF-Rate-Limit-Regel anlegen und Budget-Warnung im Dashboard setzen.
2. `run_worker_first` auf Muster umstellen (Abschnitt 6).
3. Eigener schlanker Guard (Ebene 2 und 3, Entwurf im Anhang) im **Free-Plan**. Upgrade auf Paid erst,
   wenn der Sparmodus im Alltag anspringt; dann nur die `BUDGET_DAILY_*`-Werte ändern und Ebene 4 ergänzen.
4. Alternative bleibt ein VPS mit Festpreis (z. B. Hetzner, etwa 4–8 €/Monat). Kostenrisiko 0, dafür
   Wartung (Updates, Backups) in eigener Verantwortung und Umbau der Cloudflare-Bindungen (D1, Queue,
   Cron, ASSETS, worker-mailer).

Offen: Entscheidung, ob und welche Variante umgesetzt wird.

## Anhang: verworfener Entwurf

Ablauf, wenn der Entwurf wiederbelebt wird:

- Migration `migrations/0101_budget_state.sql`:

  ```sql
  CREATE TABLE budget_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    level INTEGER NOT NULL DEFAULT 0,
    usage_date TEXT, requests INTEGER, rows_read INTEGER, rows_written INTEGER,
    checked_at TEXT, check_error TEXT, check_error_notified_at TEXT,
    cap_exceeded_count INTEGER NOT NULL DEFAULT 0,
    cap_exceeded_notified_count INTEGER NOT NULL DEFAULT 0,
    cap_exceeded_last_at TEXT, cap_exceeded_last_source TEXT
  );
  INSERT INTO budget_state (id) VALUES (1);
  ```

- Einbindung in `src/worker.js`:
  - `scheduled`: Bei `event.cron === '* * * * *'` nur `runBudgetWatch(env, { notify })` ausführen
    und zurückkehren. **Wichtig:** Die bisherigen Stunden-Jobs laufen sonst bei jedem Cron, also
    jede Minute. Danach `env = { ...env, DB: guardDb(env.DB, INVOCATION_LIMITS.scheduled, …) }`.
  - `queue` und `fetch`: ebenso einhüllen und nach dem Aufruf `recordIfInvocationLimitExceeded(rawDb, env.DB)`.
  - `fetch`: Vor den API-Routen `currentBudgetLevel(rawDb)` und `isApiRouteAllowed()`. Im catch
    `InvocationLimitError` als 503 behandeln. Bei Stufe > 0 den Header `X-PTM-Budget` setzen.
  - `notifyAdminsAboutBudget()`: `createSystemNotification()` für alle Admins mit Event `budget_alert`.
    Fehlt noch: Texte in `SYSTEM_NOTIFICATION_TEXTS` (5 Sprachen), die Darstellung in
    `src/components/layout.jsx` und die Locales.
- `wrangler.jsonc`: Cron `* * * * *`, `vars` `BUDGET_DAILY_*` und `CF_ACCOUNT_ID`, Secret
  `CF_ANALYTICS_API_TOKEN` per `wrangler secret put`.
- Frontend (nicht begonnen): Header in `src/lib/api.js` auslesen, kleiner Store, Banner neben
  `OfflineNotice` in `src/main.jsx`, `postboxSummaryQuery` nur bei Stufe 0.
- Tests (nicht begonnen): `guardDb` mit dem D1-Shim (der Shim liefert keine `meta.rows_*`; Tests
  brauchen einen Mock mit `meta`), `runBudgetWatch` mit Fake-`fetch`, `isApiRouteAllowed`.

`src/budget-guard.js` (Entwurf, ungetestet):

```js
// Kosten-/Kontingent-Guard für Cloudflare Workers + D1.
//
// Free-Plan: Überschreitet das Konto ein Tageslimit (Requests, gelesene/geschriebene D1-Zeilen),
// fällt die Seite bis 00:00 UTC komplett aus. Paid-Plan: Mehrverbrauch wird ohne Obergrenze
// berechnet. Beides verhindern zwei Ebenen:
//  1. guardDb(): Obergrenze gelesener/geschriebener Zeilen pro Aufruf (Request, Cron, Queue-Batch).
//     Eine Endlosschleife oder teure Query bricht ab, statt das Tageskontingent zu verbrauchen.
//  2. runBudgetWatch(): Minuten-Cron fragt den Tagesverbrauch des Kontos per GraphQL-Analytics ab und
//     setzt die Betriebsstufe; isApiRouteAllowed() schaltet danach unwichtige Funktionen ab.
// Die Tagesbudgets kommen aus wrangler.jsonc (BUDGET_DAILY_*); beim Wechsel auf Paid dort anpassen.

export const BUDGET_LEVEL_NORMAL = 0;
export const BUDGET_LEVEL_SPAR = 1;
export const BUDGET_LEVEL_KRITISCH = 2;

export const BUDGET_SPAR_THRESHOLD = 0.7;
export const BUDGET_KRITISCH_THRESHOLD = 0.9;

// Free-Plan-Tageslimits als Vorgabe, falls in wrangler.jsonc nichts gesetzt ist.
const DEFAULT_DAILY_LIMITS = { requests: 100_000, rowsRead: 5_000_000, rowsWritten: 100_000 };

// Zeilen-Grenzen pro Aufruf. Die teuerste normale Abfrage (Turnierliste) liest einige hundert Zeilen.
export const INVOCATION_LIMITS = {
  fetch: { rowsRead: 50_000, rowsWritten: 5_000 },
  scheduled: { rowsRead: 500_000, rowsWritten: 20_000 },
  queue: { rowsRead: 20_000, rowsWritten: 1_000 },
};

export const BUDGET_HEADER = 'X-PTM-Budget';
export const BUDGET_RESTRICTED_MESSAGE = 'Diese Funktion ist wegen hoher Auslastung vorübergehend abgeschaltet.';
export const INVOCATION_LIMIT_MESSAGE = 'Die Anfrage war zu aufwendig und wurde abgebrochen.';

const LEVEL_CACHE_MS = 60_000;
const CHECK_ERROR_NOTIFY_INTERVAL_MS = 6 * 60 * 60_000;
const ANALYTICS_URL = 'https://api.cloudflare.com/client/v4/graphql';

export class InvocationLimitError extends Error {
  constructor(source, usage, limits) {
    super(`D1-Zeilen-Grenze überschritten (${source}): ${usage.rowsRead}/${limits.rowsRead} gelesen, ${usage.rowsWritten}/${limits.rowsWritten} geschrieben`);
    this.name = 'InvocationLimitError';
    this.source = source;
  }
}

const INNER = Symbol('innerStatement');

/**
 * Hüllt eine D1-Datenbank so ein, dass alle Anweisungen eines Aufrufs ihre gelesenen/geschriebenen
 * Zeilen (meta.rows_read / meta.rows_written) aufsummieren. Liegt die Summe über der Grenze, wirft die
 * nächste Anweisung InvocationLimitError, die überschreitende selbst ebenfalls.
 */
export function guardDb(db, limits, source) {
  const usage = { rowsRead: 0, rowsWritten: 0 };
  let exceeded = false;

  const assertWithinLimits = () => {
    if (exceeded || usage.rowsRead > limits.rowsRead || usage.rowsWritten > limits.rowsWritten) {
      exceeded = true;
      throw new InvocationLimitError(source, usage, limits);
    }
  };
  const count = (result) => {
    usage.rowsRead += Number(result?.meta?.rows_read) || 0;
    usage.rowsWritten += Number(result?.meta?.rows_written) || 0;
    assertWithinLimits();
    return result;
  };

  const wrap = (statement) => ({
    [INNER]: statement,
    bind: (...values) => wrap(statement.bind(...values)),
    async all() {
      assertWithinLimits();
      return count(await statement.all());
    },
    async run() {
      assertWithinLimits();
      return count(await statement.run());
    },
    // D1 führt auch bei first() die ganze Abfrage aus, liefert aber keine meta-Angaben; daher über all().
    async first(column) {
      assertWithinLimits();
      if (typeof statement.all !== 'function') return statement.first(column);
      const row = count(await statement.all()).results?.[0] ?? null;
      if (!column) return row;
      return row ? row[column] ?? null : null;
    },
  });

  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    async batch(statements) {
      assertWithinLimits();
      const results = await db.batch(statements.map((statement) => statement[INNER] || statement));
      results.forEach((result) => {
        usage.rowsRead += Number(result?.meta?.rows_read) || 0;
        usage.rowsWritten += Number(result?.meta?.rows_written) || 0;
      });
      assertWithinLimits();
      return results;
    },
    usage,
    source,
    get limitExceeded() { return exceeded; },
  };
}

export function dailyLimits(env) {
  const read = (name, fallback) => {
    const value = Number(env?.[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    requests: read('BUDGET_DAILY_REQUESTS', DEFAULT_DAILY_LIMITS.requests),
    rowsRead: read('BUDGET_DAILY_ROWS_READ', DEFAULT_DAILY_LIMITS.rowsRead),
    rowsWritten: read('BUDGET_DAILY_ROWS_WRITTEN', DEFAULT_DAILY_LIMITS.rowsWritten),
  };
}

/** Höchster Anteil am Tagesbudget über alle Kennzahlen, mit der Kennzahl, die ihn verursacht. */
export function budgetUsageShare(usage, limits) {
  return ['requests', 'rowsRead', 'rowsWritten']
    .map((metric) => ({ metric, share: (Number(usage[metric]) || 0) / limits[metric] }))
    .reduce((highest, entry) => (entry.share > highest.share ? entry : highest));
}

export function budgetLevelFor(share) {
  if (share >= BUDGET_KRITISCH_THRESHOLD) return BUDGET_LEVEL_KRITISCH;
  if (share >= BUDGET_SPAR_THRESHOLD) return BUDGET_LEVEL_SPAR;
  return BUDGET_LEVEL_NORMAL;
}

// Sparmodus: Zusatzfunktionen mit Polling oder vielen Lesezugriffen aus.
const SPAR_BLOCKED_ROUTES = [
  /^\/api\/postbox\/(summary|recipients)(\/|$)/,
  /^\/api\/geocode$/,
  /^\/api\/saved-searches(\/|$)/,
  /^\/api\/username-available$/,
  /^\/api\/admin\/dashboard-stats$/,
  /^\/api\/admin\/petanque-aktuell\//,
];

// Kritisch: nur noch, was ein laufendes Turnier braucht, plus Anmeldung und Verwaltung durch Admins.
const KRITISCH_ALLOWED_ROUTES = [
  /^\/api\/(bootstrap|session|login|logout)$/,
  /^\/api\/auth\//,
  /^\/api\/tournaments(\/|$)/,
  /^\/api\/registrations(\/|$)/,
  /^\/api\/live\//,
  /^\/api\/sync\//,
  /^\/api\/admin\//,
];

export function isApiRouteAllowed(level, pathname) {
  if (level >= BUDGET_LEVEL_SPAR && SPAR_BLOCKED_ROUTES.some((route) => route.test(pathname))) return false;
  if (level >= BUDGET_LEVEL_KRITISCH) return KRITISCH_ALLOWED_ROUTES.some((route) => route.test(pathname));
  return true;
}

let cachedLevel = { value: BUDGET_LEVEL_NORMAL, fetchedAt: -Infinity };

/** Betriebsstufe, pro Isolate höchstens einmal je Minute aus D1 gelesen. Fehler zählen als normal. */
export async function currentBudgetLevel(db, now = Date.now()) {
  if (now - cachedLevel.fetchedAt < LEVEL_CACHE_MS) return cachedLevel.value;
  let value = BUDGET_LEVEL_NORMAL;
  try {
    const row = await db.prepare('SELECT level FROM budget_state WHERE id = 1').first();
    value = Number(row?.level) || BUDGET_LEVEL_NORMAL;
  } catch (error) {
    console.error('Reading budget level failed', error);
  }
  cachedLevel = { value, fetchedAt: now };
  return value;
}

export function resetBudgetLevelCache() {
  cachedLevel = { value: BUDGET_LEVEL_NORMAL, fetchedAt: -Infinity };
}

/**
 * Zählt einen abgebrochenen Aufruf, falls guardedDb die Grenze erreicht hat; der Minuten-Cron
 * benachrichtigt daraufhin die Admins. Erst nach dem Aufruf geprüft, weil manche Pfade Fehler abfangen.
 */
export async function recordIfInvocationLimitExceeded(rawDb, guardedDb, now = new Date()) {
  if (!guardedDb?.limitExceeded) return;
  try {
    await rawDb.prepare(`UPDATE budget_state SET cap_exceeded_count = cap_exceeded_count + 1, cap_exceeded_last_at = ?1,
        cap_exceeded_last_source = ?2 WHERE id = 1`)
      .bind(now.toISOString(), String(guardedDb.source || '').slice(0, 200)).run();
  } catch (recordError) {
    console.error('Recording invocation limit failed', recordError);
  }
}

export async function fetchDailyUsage(env, date, fetchImpl = fetch) {
  const response = await fetchImpl(ANALYTICS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($account: String!, $date: Date!) { viewer { accounts(filter: { accountTag: $account }) {
        workers: workersInvocationsAdaptive(limit: 10000, filter: { date: $date }) { sum { requests } }
        d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date: $date }) { sum { rowsRead rowsWritten } }
      } } }`,
      variables: { account: env.CF_ACCOUNT_ID, date },
    }),
  });
  if (!response.ok) throw new Error(`Analytics HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`Analytics: ${payload.errors[0].message}`);
  const account = payload.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('Analytics: Konto nicht gefunden');
  const sum = (groups, field) => (groups || []).reduce((total, group) => total + (Number(group.sum?.[field]) || 0), 0);
  return {
    requests: sum(account.workers, 'requests'),
    rowsRead: sum(account.d1, 'rowsRead'),
    rowsWritten: sum(account.d1, 'rowsWritten'),
  };
}

/**
 * Minuten-Cron: Tagesverbrauch prüfen, Betriebsstufe setzen, Admins bei Stufenwechsel, abgebrochenen
 * Aufrufen und dauerhaft fehlschlagender Abfrage benachrichtigen. notify(eventData) schreibt die
 * Admin-Benachrichtigung. Ohne CF_ANALYTICS_API_TOKEN ist der Wächter aus (Stufe bleibt, wie sie ist).
 */
export async function runBudgetWatch(env, { now = new Date(), fetchImpl = fetch, notify } = {}) {
  const db = env.DB;
  const state = await db.prepare('SELECT * FROM budget_state WHERE id = 1').first();
  if (!state) return { skipped: 'no_state' };
  const nowIso = now.toISOString();

  if (Number(state.cap_exceeded_count) > Number(state.cap_exceeded_notified_count)) {
    await notify({
      kind: 'cap',
      count: Number(state.cap_exceeded_count) - Number(state.cap_exceeded_notified_count),
      source: state.cap_exceeded_last_source || '',
    });
    await db.prepare('UPDATE budget_state SET cap_exceeded_notified_count = ?1 WHERE id = 1').bind(state.cap_exceeded_count).run();
  }

  if (!env.CF_ANALYTICS_API_TOKEN || !env.CF_ACCOUNT_ID) return { skipped: 'no_token' };

  const date = nowIso.slice(0, 10);
  let usage;
  try {
    usage = await fetchDailyUsage(env, date, fetchImpl);
  } catch (error) {
    const message = String(error.message || error).slice(0, 300);
    const lastNotified = state.check_error_notified_at ? Date.parse(state.check_error_notified_at) : -Infinity;
    const notifyNow = now.getTime() - lastNotified >= CHECK_ERROR_NOTIFY_INTERVAL_MS;
    if (notifyNow) await notify({ kind: 'check_failed', error: message });
    await db.prepare('UPDATE budget_state SET check_error = ?1, check_error_notified_at = ?2 WHERE id = 1')
      .bind(message, notifyNow ? nowIso : state.check_error_notified_at).run();
    return { error: message };
  }

  const { metric, share } = budgetUsageShare(usage, dailyLimits(env));
  const level = budgetLevelFor(share);
  const previousLevel = Number(state.level) || BUDGET_LEVEL_NORMAL;
  // Geschrieben wird nur bei Änderung, damit der Wächter selbst kaum Kontingent verbraucht.
  if (level !== previousLevel || state.check_error || state.usage_date !== date) {
    await db.prepare(`UPDATE budget_state SET level = ?1, usage_date = ?2, requests = ?3, rows_read = ?4, rows_written = ?5,
        checked_at = ?6, check_error = NULL, check_error_notified_at = NULL WHERE id = 1`)
      .bind(level, date, usage.requests, usage.rowsRead, usage.rowsWritten, nowIso).run();
  }
  if (level !== previousLevel) {
    await notify({ kind: 'level', level, previousLevel, metric, percent: Math.round(share * 100) });
  }
  return { level, usage, metric, share };
}
```
