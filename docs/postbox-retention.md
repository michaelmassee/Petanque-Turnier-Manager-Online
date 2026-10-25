# Persönliche Postbox-Aufbewahrung

Im Profil ist „Gelesene Nachrichten löschen nach (Tagen)“ von 1 bis 365 Tagen
einstellbar, standardmäßig 7 Tage für bestehende und neue Konten. Gezählt wird
ab der ersten Gelesen-Markierung, nicht ab dem Versand. Beim Anzeigen der
geladenen Nachrichten markiert der Client genau deren IDs, einschließlich
eigener gesendeter Kopien. Erneutes Anzeigen verlängert die Frist nicht.

Der bestehende tägliche Cron um 01:00 UTC bereinigt fällige gelesene Kopien,
auch wenn der Nutzer offline bleibt. Eine neue Profilfrist gilt beim nächsten
Lauf auch für bereits gelesene Nachrichten. Unabhängig davon hält die Postbox
pro Konto höchstens 25 Nachrichten, nach Versandzeit und bei gleichen Zeiten
nach Zustellungsreihenfolge. Neue Nachrichten verdrängen die ältesten,
einschließlich ungelesener. Es gibt kein Nachladen weiterer Seiten.

Migration `0133_postbox_retention.sql` muss vor dem Worker-Deployment laufen.
Sie ergänzt `users.postbox_read_retention_days` sowie `postbox_entries` für
persönliche Kopien und Lesenachweise. Der Inhalt bleibt gemeinsam in
`postbox_messages`, solange wenigstens eine persönliche Kopie ihn benötigt.
Lesen und Löschen eines Kontos verändern die Kopien anderer Konten nicht.

Ein Insert-Trigger stellt alle Nachrichtenarten atomar zu und begrenzt jede
betroffene Postbox, unabhängig von Sitzungen. Rundnachrichten gehen an die beim
Versand verknüpften offenen, bestätigten und Wartelisten-Konten, dedupliziert
über alle Personen-Slots, sowie an den Absender. Später neu angemeldete Konten
erhalten keine rückwirkende Zustellung alter Rundnachrichten. Nach einer
Abmeldung bleiben die bisherigen Zugriffsbeschränkungen bestehen. Bei
Admin-Gruppennachrichten erscheint weiterhin nur eine Absenderkopie.

Die Migration übernimmt vorhandene Direktnachrichten und deren persönliche
Empfänger-Lesezeitpunkte. Der bisher gemeinsame Lesezeitpunkt von Rundnachrichten
ist kein persönlicher Lesenachweis; diese Kopien erscheinen zunächst ungelesen.
Alte Absenderkopien ohne eigenen Lesenachweis bleiben ebenfalls ungelesen.
Bestehende Postboxen werden bereits bei der Migration auf 25 Kopien begrenzt.
Das separate siebentägige Archiv für Administrator-Nachtberichte bleibt erhalten.

`PUT /api/me` akzeptiert `postboxReadRetentionDays` als ganze Zahl von 1 bis 365;
fehlt das Feld, bleibt die Einstellung erhalten. Sitzung und Profilantwort
liefern den gespeicherten Wert. `POST /api/postbox/read-all` akzeptiert optional
`messageIds` mit bis zu 25 IDs und markiert ausschließlich vorhandene,
zugängliche persönliche Kopien. Ältere Clients ohne Auswahl markieren ihre
aktuelle Postbox, höchstens 25 Nachrichten. Die Antwort enthält `readAt`.

Polling führt keine Bereinigung aus. Listen und Badges lesen die höchstens 25
persönlichen Kopien über einen Nutzerindex. Direkte Zustellung schlägt Empfänger
und Absender ohne vollständigen Nutzer-Scan nach; Rundnachrichten lesen die
Anmeldungen des jeweiligen Turniers. Die Bereinigung nutzt den Lesezeitindex
und prüft nur mindestens einen Tag alte gelesene Kopien. Eine kleine Kandidatenliste
ermöglicht das Entfernen verwaister Inhalte ohne vollständigen Nachrichtenscan.
Trigger, Zustellungsindizes und Kandidatenverwaltung erzeugen zusätzliche
D1-Schreibzugriffe; es gibt keine zusätzlichen Polling- oder Anbieterabfragen.
