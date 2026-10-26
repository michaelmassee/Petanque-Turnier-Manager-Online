<img align="right" src="public/icons/logo.png" alt="Logo des Pétanque-Turnier-Managers" height="120">

# Pétanque Turnier Manager Online

[![Quality Gate](https://github.com/michaelmassee/Petanque-Turnier-Manager-Online/actions/workflows/quality-gate.yml/badge.svg)](https://github.com/michaelmassee/Petanque-Turnier-Manager-Online/actions/workflows/quality-gate.yml)
[![Security](https://github.com/michaelmassee/Petanque-Turnier-Manager-Online/actions/workflows/security.yml/badge.svg)](https://github.com/michaelmassee/Petanque-Turnier-Manager-Online/actions/workflows/security.yml)
[![Cloudflare Workers](https://img.shields.io/badge/Plattform-Cloudflare%20Workers-F38020.svg)](https://workers.cloudflare.com/)
[![PWA](https://img.shields.io/badge/App-installierbare%20PWA-1677ff.svg)](https://ptmonline.org/)
[![Spenden mit PayPal](https://img.shields.io/badge/Spenden-PayPal-blue.svg)](https://www.paypal.me/michaelmassee1)

> *Gebaut mit der Präzision eines Informatikers und der Leidenschaft eines Boulers.*

## 🎯 Pétanque-Turniere online organisieren

Der **Pétanque Turnier Manager Online** ergänzt den
[Pétanque-Turnier-Manager für LibreOffice Calc](https://github.com/michaelmassee/Petanque-Turnier-Manager)
um eine moderne, browserbasierte Turnierplattform. Turnierleiter verwalten
Turniere, Anmeldungen und Teilnehmer direkt im Browser; Spieler finden offene
Turniere und melden sich unkompliziert über Handy, Tablet oder PC an.

Die Anwendung ist als installierbare Progressive Web App ausgelegt. Die
konfigurierte Produktionsadresse ist [ptmonline.org](https://ptmonline.org/).
Die Oberfläche ist verfügbar in Deutsch, Niederländisch, Englisch, Spanisch
und Französisch.

**Vorteile auf einen Blick:**

* **Einfach anmelden:** Öffentliche Turniere finden, Details ansehen und direkt online melden.
* **Für Turnierleiter gemacht:** Anmeldungen prüfen, bestätigen, Wartelisten verwalten und Teilnehmer exportieren.
* **Mobil nutzbar:** Als PWA installierbar und für den Einsatz am Bouleplatz optimiert.
* **Mehrsprachig:** DE, NL, EN, ES und FR sind direkt in der Anwendung umschaltbar.
* **Sicher aufgebaut:** Sitzungen, Rollen, API-Schlüssel und Eingaben werden serverseitig abgesichert.
* **Offen verbunden:** Autorisierte Turnierprogramme können Turniere, Meldungen und Ergebnisse über die API synchronisieren.

---

## 🏆 Funktionen

### 📅 Turniere entdecken und veröffentlichen

* Öffentliche Turnierübersicht mit Suche, Filtern und Umkreissuche
* Turnierdetails mit Ort, Startzeit, Spielsystem, freien Plätzen und Kontakt
* Öffentliche oder private Turniere mit teilbaren Anmeldelinks
* Vereine und Bouleplätze auf einer Karte entdecken und Turnieren zuordnen

### 📝 Anmeldungen ohne Papierchaos

* Anmeldung für Tête-à-tête, Doublette und Triplette
* Unterstützung für Forme, Mêlée und Supermêlée
* Bestätigte Anmeldungen, Freigabe durch die Turnierleitung und Wartelisten
* Startgeld-Tarife, Lizenzpflicht, Teamnamen und private Hinweise an die Turnierleitung
* E-Mail-Bestätigungen, Erinnerungen und Stornierung über einen sicheren Link

### 🎯 Turnierverwaltung und Live-Spielbetrieb

* Turniere direkt online anlegen und bearbeiten
* Teilnehmer verwalten, CSV exportieren und manuell ergänzen
* Schweizer System und Mêlée/Supermêlée online durchführen
* Runden auslosen, Ergebnisse eintragen und Ranglisten live anzeigen
* Interne Postbox, Aufgabenhinweise und Push-Benachrichtigungen

### 🔗 Gemeinsam mit dem Desktop-Programm

Der Pétanque-Turnier-Manager Online kann eigenständig verwendet werden oder
mit dem Desktop-Projekt verbunden werden. Über freigegebene API-Schlüssel
können berechtigte Turnierleiter Turnierdaten übertragen sowie Anmeldungen und
Ergebnisse synchronisieren.

---

## 🚀 Direkt loslegen

1. Öffne [ptmonline.org](https://ptmonline.org/).
2. Suche ein öffentliches Turnier oder erstelle ein Benutzerkonto.
3. Melde dich an oder verwalte als Turnierleiter dein eigenes Turnier.
4. Installiere die App bei Bedarf über das Browser-Menü auf deinem Gerät.

> **💡 Für Veranstalter:** Ein Turnier kann mit wenigen Angaben angelegt werden.
> Danach steuerst du Anmeldung, Teilnehmerliste und Kommunikation zentral an
> einem Ort.

## 🛠️ Entwicklung und Deployment

* `npm run dev` baut die App, wendet die D1-Migrationen lokal an, vergibt fehlende Benutzernamen und startet `wrangler dev`.
* `npm run db:seed:testturniere` legt in der lokalen D1 für manuelle Tests je ein Testturnier pro online durchführbarem System an (Schweizer, Formule X, KO, Jeder gegen jeden, Mêlée, Supermêlée). Die Turniere finden heute statt, alle Meldungen sind bestätigt (70, bei Jeder gegen jeden 8), und sie lassen sich sofort starten. Live-Ansicht und Ergebnismeldung durch Spieler sind freigegeben. Das Testkonto `ptm-user@example.test` ist jeweils mit Meldung 1 verknüpft. Das Skript darf beliebig oft laufen: Es löscht nur Turniere mit ID-Präfix `testturnier-` und setzt sie auf den Anmeldestatus zurück. Es arbeitet nur lokal und spielt vorher die gitignorierte `.dev.vars.test-users.sql` ein, falls vorhanden.
* `npm run deploy` (nur von `master`) führt das Quality-Gate aus und dann in dieser Reihenfolge:
  1. D1-Migrationen remote anwenden (`db:migrate:remote`)
  2. Fehlende Benutzernamen vergeben (`db:backfill:remote`, Skript `scripts/backfill-usernames.mjs`)
  3. `wrangler deploy`
  4. Backfill erneut, für Konten, die der alte Worker während des Deploys ohne Benutzernamen angelegt hat

  Der Backfill ist idempotent und bricht den Ablauf ab, wenn danach noch Konten ohne Benutzernamen übrig sind.
  Nach dem Deploy prüfen: Zahl der Konten unverändert, `SELECT COUNT(*) FROM users WHERE username IS NULL` ergibt `0`.

## Spielersuche bei der Turnieranmeldung

Verifizierte Nutzer und die Turnierleitung erhalten beim Tippen in Vorname oder Nachname Vorschläge registrierter Nutzer. Wie bei den Postbox-Empfängern wird die Nutzerliste (`/api/postbox/recipients`: Name, @Benutzername, Verein) einmal geladen, gemeinsam mit der Postbox gecacht und lokal gefiltert; beim Tippen entstehen keine Serverabfragen. Für die eigene Anmeldung wird das eigene Konto ergänzt. Die Namensfelder bleiben freie Eingabe: Ohne Auswahl wird manuell angemeldet, ohne Treffer erscheint keine Liste. Erst die Auswahl lädt E-Mail und Lizenznummer; sie verknüpft den Spieler beim Speichern mit seinem Konto.

Der POST-Endpunkt `/api/tournaments/:id/registration-players/details` verlangt eine Sitzung mit verifizierter E-Mail, Turnierzugriff und einen neuen Turnstile-Token. `TURNSTILE_SITE_KEY` und das Secret `TURNSTILE_SECRET_KEY` müssen für die Umgebung eingerichtet sein; Hostname und die Aktion `registration_player_details` werden geprüft. Fehlende Konfiguration sperrt den Abruf. Lokale Tests dürfen nur ausdrücklich konfigurierte Testschlüssel verwenden; es gibt keinen automatischen Sicherheits-Bypass.

Die Rate-Limit-Bindings in `wrangler.jsonc` begrenzen Profildetails auf 6 pro Konto und 30 pro IP je Minute, ohne D1-Zählerabfragen. Die Begrenzung gilt je Cloudflare-Standort und ist kein globales Kontingent. Signierte Auswahlbelege sind an das anmeldende Konto und Turnier gebunden und laufen nach fünf Minuten ab. Danach muss der Spieler erneut ausgewählt werden. Eine Datenbankmigration ist nicht erforderlich.

## Geplanter Anmeldebeginn

Turniere mit zukünftigem Anmeldebeginn werden durch einen SQLite-basierten Durable-Object-Alarm freigegeben, auch ohne Abonnenten. Freigabe, Postbox-Nachrichten und Abschluss der einmaligen Abos werden gemeinsam in D1 gespeichert. Push wird danach nur für Konten mit Push-Freigabe über die vorhandene Queue eingereiht.

Ein gemeinsamer Scheduler setzt nur den nächsten Alarm. Terminänderungen planen ihn neu; manuelle Sperren haben Vorrang. Persönliche Abo-Zustände werden auf Nachfrage geladen und für alle Karten wiederverwendet. Fällige Turniere, Ereignisse und offene Push-Aufträge haben eigene Indizes. Die Arbeit pro Alarm ist begrenzt, um D1-Free-Limits einzuhalten.

Beim ersten Release: Migration `0110_registration_opening_notifications.sql` anwenden und den Worker mit der neuen Durable-Object-Bindung deployen. Anschließend als eingeloggter Admin einmal `POST /api/admin/registration-opening-scheduler/sync` aufrufen, damit auch bereits vorhandene Termine sofort eingeplant sind. Der bestehende stündliche Wartungslauf prüft als Fehlerabsicherung nur eine Änderungsmarkierung; er fragt nicht regelmäßig die Öffnungsdaten aller Turniere ab. Bei einem Queue-Fehler bleiben Push-Aufträge gespeichert und der Alarm wiederholt den fehlgeschlagenen Schritt mit wachsendem Abstand.

Die Funktion verschickt keine E-Mails. Gäste können keine Öffnungsbenachrichtigung abonnieren.

Der lokale Alarmtest läuft mit einem isolierten Miniflare und benötigt einen lokalen Listener. Nach einem Dry-Run (`wrangler deploy --dry-run --outdir /tmp/ptm-opening-smoke`) prüft `node scripts/registration-opening-smoke.mjs /tmp/ptm-opening-smoke` die echte Alarm-Ausführung mit und ohne Abo. Der Test verwendet weder Produktionsdaten noch echte Push-Empfänger.

## 🤝 Mitwirken

Fehlerberichte, Ideen und Pull Requests sind willkommen. Bitte beachte vor
einem Beitrag die Hinweise in [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitslücken
gehören nicht in öffentliche Issues; hierfür gilt der Meldeweg aus
[SECURITY.md](SECURITY.md).

## ❤️ Unterstützung

Wenn dir der Pétanque-Turnier-Manager hilft, freue ich mich über eine
[Unterstützung via PayPal](https://www.paypal.me/michaelmassee1).
