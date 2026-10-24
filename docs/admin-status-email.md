# Tägliche Administrator-Statusmail

Der vorhandene tägliche Cron (`0 1 * * *`) erstellt nach den Wartungsjobs einen
Bericht für jedes Administratorkonto mit bestätigter E-Mail-Adresse. Das entspricht
01:00 UTC, 02:00 MEZ bzw. 03:00 MESZ, im Abstand von 24 Stunden. Migration
`0113_admin_status_reports.sql` und `0130_admin_postbox_messages.sql` müssen vor dem
Worker-Deploy angewendet werden.

Die Mail verwendet die Kontosprache (DE/EN/FR/NL/ES, sonst DE), die vorhandene
Mail-Queue und den bestehenden HTML-/Klartext-Mailversand inklusive Footer.
Der Schalter für Turniermails beeinflusst diese Administratormail nicht.

Der Bericht enthält aktuelle Bestände, neue noch vorhandene Einträge im festen
24-Stunden-Zeitfenster des Cron-Ereignisses, Turnier- und Anmeldestatus, offene
Freigaben, Spielerbörse und Importe. Reine Kalendereinträge werden separat gezählt.
Besucherzahlen beziehen sich auf den vorherigen vollständigen UTC-Kalendertag,
weil nur Tagesaggregate vorliegen. Wartungsjobs werden nach Abschluss ausgewertet;
abgefangene Fehler einzelner Datensätze stehen weiterhin im Worker-Protokoll.

Jeder Admin erhält außerdem seine eigenen direkt eingegangenen Postbox-Nachrichten
aus dem Berichtszeitraum mit Absender, UTC-Zeitpunkt und vollständigem Nachrichtentext.
Nachrichten an andere Admins erscheinen nicht in seiner Mail. Rich Text wird im
Bericht als lesbarer Klartext ausgegeben. Systemnachrichten und Turnier-Broadcasts
sind nicht Teil dieser Liste.

Damit das Postbox-Limit von 25 Nachrichten keine Berichtseinträge entfernt, hält
`admin_postbox_messages` Nachrichten an Admins separat für sieben Tage vor. Ein
Insert-Trigger schreibt die Kopie atomar mit der Postbox-Nachricht. Der Tageslauf
löscht ältere Kopien über einen Zeitindex, auch wenn keine Berichtsempfänger offen
sind. Bei Löschung des Absender- oder Empfängerkontos entfallen auch die zugehörigen
Nachrichtenkopien. Die Migration übernimmt noch vorhandene
Adminnachrichten der letzten sieben Tage für den nächsten Bericht.

## Einzelmails für Nachrichten an Admins

Admins sind in der Postbox-Empfängerauswahl und über die bestehende exakte
E-Mail-Suche erreichbar. Eine direkte Nachricht an einen Admin wird
zusätzlich an die bestätigte E-Mail-Adresse des angeschriebenen Admins eingereiht.
Die Mail enthält Absender und Nachricht mit Rich-Text-Formatierung sowie einen
Link zur App; geantwortet wird über die Postbox. Die Kontosprache und der bestehende
HTML-/Klartextversand inklusive Footer gelten auch hier. Der Turnier-Mail-Schalter
beeinflusst diese Mails nicht. Andere Admins erhalten keine Kopie.
Das gilt auch für Adresskorrekturen, die an zuständige Admins gehen. Bei
Teaminformationen entfällt die zusätzliche Adminmail, wenn dieselbe Adresse bereits
die Teammail erhält.

Providerfehler werden über die bestehenden Queue-Retries behandelt. Schlägt bereits
das Einreihen fehl, bleiben Postbox-Nachricht und Berichtskopie gespeichert, der
Fehler wird protokolliert. Für diese Einzelmail gibt es dann keinen automatischen
erneuten Einreihversuch; der Nachtbericht enthält die Nachricht weiterhin.

Für die tägliche Statusmail verhindert ein atomarer Versandmarker mehrfaches Einreihen durch wiederholte oder
parallele Tagesläufe. Queue-Fehler geben den jeweiligen Marker für einen erneuten
Aufruf frei, während weitere Empfänger bearbeitet werden. Der Marker bestätigt das
Einreihen, nicht die Zustellung. Providerfehler behandelt der bestehende Queue-Consumer
mit Retries und Dead-Letter-Queue. Zwischen Marker und Queue besteht keine gemeinsame
Transaktion; ein harter Abbruch in diesem kurzen Abschnitt kann eine Tagesmail auslassen.

## Zusätzlicher Ressourcenverbrauch

Die folgende Rechnung beschreibt ausschließlich die neue Statusmail. Die bestehenden
Wartungsjobs laufen ohnehin. Es wurden keine Produktionsabfragen zur Kostenermittlung
ausgeführt; tatsächliche Kontingentauslastung und Providerverträge sind damit nicht geprüft.

- Ein Tageslauf: acht Statistik-Statements in einem D1-Batch, einmal gemeinsam
  für alle Empfänger. Ein Batch reduziert die Aufrufe, nicht die abgerechneten Lesezeilen.
- Fünf vollständige Tabellendurchläufe: `users`, `tournaments`, `registrations`,
  `player_listings`, `petanque_aktuell_imports`. Ihr Aufwand wächst mit dem Bestand.
  Gesamtzahlen und neue Einträge werden jeweils in demselben Durchlauf ermittelt.
- Freigaben verwenden bestehende Statusindizes; Besucher lesen höchstens zwei
  Tagesaggregate. Die Empfängersuche verwendet einen partiellen Index ausschließlich
  für verifizierte Administratoren. Normale Benutzer erzeugen dort keine Indexeinträge.
  Die zusätzliche Nachrichtenabfrage verwendet den Zeitindex und liest nur Kopien
  im Berichtszeitraum; Namen werden über die Benutzer-ID geladen.
- Hinzu kommen die tägliche Marker- und Nachrichtenbereinigung, eine Empfängersuche und ein
  `INSERT OR IGNORE` je Empfänger: insgesamt `11 + A` SQL-Statements bei `A`
  Empfängern, ohne Fehler/Wiederholungen. Die Freigabeabfrage enthält vier Unterabfragen.
- Je Administrator entsteht täglich ein neuer Versandmarker; nach Ablauf der Frist
  wird ein alter gelöscht. Dazu kommen die D1-Schreibzugriffe für den Primärindex.
  Gespeichert bleiben höchstens acht Berichtstage, ohne Mailinhalt oder zusätzliche Adressen.
- Keine zusätzlichen Statusabfragen im Stunden-Cron, keine Analytics-API-Aufrufe.
  Ohne offene Empfänger entfallen die acht Statistikabfragen vollständig.
- Je Administrator eine Queue-Nachricht und eine Mail pro Tag, also etwa `30 × A`
  Mails pro Monat. Bei Nachrichten unter 64 KB normalerweise `3 × A` Queue-Operationen
  pro Tag (Schreiben, Lesen, Löschen); Retries kommen hinzu.
- Die Mail zeigt die Summe von `meta.rows_read` der acht Statistik-Statements.
  Das kostet keine weitere Abfrage. Empfängersuche, Marker und andere Wartungsjobs
  sind in dieser Zahl nicht enthalten.
- Je direkter Postbox-Nachricht an einen Admin entstehen eine zusätzliche kurzlebige
  Nachrichtenkopie samt Indizes und eine Einzelmail über die Queue. Der Versand nutzt
  bei manuellen Postbox-Nachrichten die ohnehin gelesenen Empfängerdaten. Andere
  direkte Versandwege lesen den Admin-Kontext einmal über den Primärindex der
  Nachrichtenkopie. Es gibt kein zusätzliches Polling. Der spätere Löschlauf
  entfernt abgelaufene Kopien.

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
