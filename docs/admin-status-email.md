# Tägliche Administrator-Statusmail

Der vorhandene tägliche Cron (`0 1 * * *`) erstellt nach den Wartungsjobs einen
Bericht für jedes Administratorkonto mit bestätigter E-Mail-Adresse. Das entspricht
01:00 UTC, 02:00 MEZ bzw. 03:00 MESZ, im Abstand von 24 Stunden. Migration
`0113_admin_status_reports.sql` muss vor dem Worker-Deploy angewendet werden.

Die Mail verwendet die Kontosprache (DE/EN/FR/NL/ES, sonst DE), die vorhandene
Mail-Queue und den bestehenden HTML-/Klartext-Mailversand inklusive Footer.
Der Schalter für Turniermails beeinflusst diese Administratormail nicht.

Der Bericht enthält aktuelle Bestände, neue noch vorhandene Einträge im festen
24-Stunden-Zeitfenster des Cron-Ereignisses, Turnier- und Anmeldestatus, offene
Freigaben, Spielerbörse und Importe. Reine Kalendereinträge werden separat gezählt.
Besucherzahlen beziehen sich auf den vorherigen vollständigen UTC-Kalendertag,
weil nur Tagesaggregate vorliegen. Wartungsjobs werden nach Abschluss ausgewertet;
abgefangene Fehler einzelner Datensätze stehen weiterhin im Worker-Protokoll.

Ein atomarer Versandmarker verhindert mehrfaches Einreihen durch wiederholte oder
parallele Tagesläufe. Queue-Fehler geben den jeweiligen Marker für einen erneuten
Aufruf frei, während weitere Empfänger bearbeitet werden. Der Marker bestätigt das
Einreihen, nicht die Zustellung. Providerfehler behandelt der bestehende Queue-Consumer
mit Retries und Dead-Letter-Queue. Zwischen Marker und Queue besteht keine gemeinsame
Transaktion; ein harter Abbruch in diesem kurzen Abschnitt kann eine Tagesmail auslassen.

## Zusätzlicher Ressourcenverbrauch

Die folgende Rechnung beschreibt ausschließlich die neue Statusmail. Die bestehenden
Wartungsjobs laufen ohnehin. Es wurden keine Produktionsabfragen zur Kostenermittlung
ausgeführt; tatsächliche Kontingentauslastung und Providerverträge sind damit nicht geprüft.

- Ein Tageslauf: sieben Statistik-Statements in einem D1-Batch, einmal gemeinsam
  für alle Empfänger. Ein Batch reduziert die Aufrufe, nicht die abgerechneten Lesezeilen.
- Fünf vollständige Tabellendurchläufe: `users`, `tournaments`, `registrations`,
  `player_listings`, `petanque_aktuell_imports`. Ihr Aufwand wächst mit dem Bestand.
  Gesamtzahlen und neue Einträge werden jeweils in demselben Durchlauf ermittelt.
- Freigaben verwenden bestehende Statusindizes; Besucher lesen höchstens zwei
  Tagesaggregate. Die Empfängersuche verwendet einen partiellen Index ausschließlich
  für verifizierte Administratoren. Normale Benutzer erzeugen dort keine Indexeinträge.
- Hinzu kommen eine tägliche Markerbereinigung, eine Empfängersuche und ein
  `INSERT OR IGNORE` je Empfänger: insgesamt `9 + A` SQL-Statements bei `A`
  Empfängern, ohne Fehler/Wiederholungen. Die Freigabeabfrage enthält vier Unterabfragen.
- Je Administrator entsteht täglich ein neuer Versandmarker; nach Ablauf der Frist
  wird ein alter gelöscht. Dazu kommen die D1-Schreibzugriffe für den Primärindex.
  Gespeichert bleiben höchstens acht Berichtstage, ohne Mailinhalt oder zusätzliche Adressen.
- Keine zusätzlichen Statusabfragen im Stunden-Cron, keine Analytics-API-Aufrufe.
  Ohne offene Empfänger entfallen die sieben Statistikabfragen vollständig.
- Je Administrator eine Queue-Nachricht und eine Mail pro Tag, also etwa `30 × A`
  Mails pro Monat. Bei Nachrichten unter 64 KB normalerweise `3 × A` Queue-Operationen
  pro Tag (Schreiben, Lesen, Löschen); Retries kommen hinzu.
- Die Mail zeigt die Summe von `meta.rows_read` der sieben Statistik-Statements.
  Das kostet keine weitere Abfrage. Empfängersuche, Marker und andere Wartungsjobs
  sind in dieser Zahl nicht enthalten.

Näherung für tägliche Lesezeilen: Summe der fünf Tabellenbestände plus offene
Freigaben, Vereinsbearbeiter-Anfragen, zwei Besuchersummen und kleine Index-/Markerzugriffe.
Beispiel: Zusammen 100.000 Zeilen in den fünf Tabellen bedeuten allein dort ungefähr
100.000 zusätzliche Lesezeilen pro Tag, rund 2 % des D1-Free-Tageskontingents.
Dies ist eine Größenordnung aus den lokal geprüften SQLite-Abfrageplänen, keine
gemessene Produktionsabrechnung. Die Migration liest beim Anlegen des partiellen
Admin-Index einmalig den Benutzerbestand.

Preisgrundlagen, geprüft am 16.10.2026:

- [D1](https://developers.cloudflare.com/d1/platform/pricing/): Free enthält
  5 Mio. Lesezeilen und 100.000 Schreibzeilen pro Tag. Bei Überschreitung schlagen
  D1-Abfragen bis zum täglichen Reset fehl. Paid enthält 25 Mrd. Lesezeilen und
  50 Mio. Schreibzeilen pro Monat; darüber 0,001 USD je Mio. Lesezeilen bzw.
  1 USD je Mio. Schreibzeilen.
- [Queues](https://developers.cloudflare.com/queues/platform/pricing/): Free enthält
  10.000 Operationen pro Tag. Paid enthält 1 Mio. Operationen pro Monat; darüber
  0,40 USD je Mio. Operationen.
- Der bestehende Mailanbieter erhält zusätzliche Mails entsprechend der Empfängerzahl.
  Ob daraus Mehrkosten entstehen, hängt vom vorhandenen Tarif und dem übrigen Versand ab.
