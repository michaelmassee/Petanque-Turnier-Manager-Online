# E-Mail-Versandstatistik

Das Admin-Dashboard zeigt erfolgreiche Übergaben an Strato oder Resend: heute,
die laufende Kalenderwoche ab Montag (UTC), den ausgewählten Zeitraum und die
Gesamtsumme seit Beginn der Erfassung. Der Verlauf bietet 7, 30, 90 und 365 Tage,
eine Auswahl nach Anbieter und eine Tabelle. Im Jahresverlauf werden die Tage
in Wochenblöcke zusammengefasst, einschließlich des ersten unvollständigen Blocks.
Alle Tagesgrenzen und die Kalenderwoche verwenden UTC, wie die übrigen Statistiken.

Migration `0132_email_delivery_stats.sql` muss vor dem Worker-Deploy angewendet
werden. Sie hält den Erfassungsbeginn fest; historische Versandzahlen lassen sich
nicht rekonstruieren. Die tatsächliche Zählung startet mit dem neuen Worker.

Direkte Mails und Queue-Mails laufen durch denselben Versandpfad. Gezählt wird
erst, wenn der Anbieter die Mail angenommen hat. Ein gescheiterter Primäranbieter
wird nicht gezählt; bei erfolgreichem Fallback zählt der tatsächlich verwendete
Anbieter. Push-Nachrichten, lokaler Log-Fallback und fehlgeschlagene Versandversuche
zählen nicht. Eine Annahmebestätigung ist keine Zustellbestätigung; spätere Bounces
oder Spamfilter sind in diesen Zahlen nicht enthalten. Wiederholte tatsächliche
Sendungen zählen separat.

Es werden ausschließlich Tageszahlen pro Anbieter gespeichert, keine Adressen,
Betreffzeilen, Mailinhalte oder einzelnen Versanddatensätze. Pro erfolgreichem
Versand erfolgt ein atomarer UPSERT ohne vorheriges Lesen. Dashboard-Abfragen
verwenden zwei Statements in einem D1-Batch: den ausgewählten Zeitraum über den
Tagesindex sowie den Gesamtstand über die kleinen Tagesaggregate (eine Zeile pro
Versandtag). Der Gesamtstand liest damit höchstens etwa 365 Zeilen pro
Erfassungsjahr. Es gibt kein Polling und keine zusätzliche Anbieter-API-Abfrage.
Ein Anbieterwechsel im Diagramm benötigt keinen Serveraufruf.

Ein Statistikfehler wird protokolliert, löst aber keinen erneuten Mailversand aus.
Zwischen externer Annahme und Datenbankschreibvorgang gibt es keine gemeinsame
Transaktion: Bei einem Abbruch oder Statistikfehler kann eine Mail im Zähler
fehlen. Queue-Wiederholungen nach einem Abbruch können mehrere tatsächliche
Sendungen verursachen. Die Statistik ist daher keine Zustell- oder
Abrechnungsbestätigung.

`GET /api/admin/email-stats?days=30` verlangt eine Administratorsitzung und liefert
die Erfassung seit `trackingSince`, lückenlose Tageswerte und die vier Summen mit
jeweils `strato`, `resend` und `total`. Unbekannte Zeiträume fallen auf 30 Tage
zurück. Vor dem Erfassungsbeginn zeigt das Diagramm leere Säulen; der Hinweis auf
fehlende historische Daten bleibt sichtbar.
