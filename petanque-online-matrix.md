# Abgleich petanque-online.de ↔ PTM Online (Stand 12.11.2026)

## Context
petanque-online.de ist ein kostenloser Turnierkalender mit Online-Anmeldung und integrierter Turniersoftware (über 210 Vereine, Schwerpunkt NRW, Niedersachsen und Baden-Württemberg). Ziel ist ein Funktionsvergleich mit PTM Online und daraus eine priorisierte Liste der Lücken, die anschließend nacheinander umgesetzt werden.
Erhoben wurde mit dem Vereinskonto „Boule Club Linden e.V.“ (Club Master). Angesehen wurden Dashboard, Mein Verein, Spieler, Turnier-Registrierung (Liste und „Neues Turnier“), Turnier-Software (Setup, Turniersystem, Turnierdokumente, Ankündigung, Serien-Auswertung, Spielfeld-Verwaltung), E-Mail-Protokoll sowie die öffentliche Liste, Detailseite und das Anmeldeformular. Es wurde nichts gespeichert oder abgeschickt.

## Funktionsmatrix (✅ vorhanden · ⚠️ teilweise · ❌ fehlt)

| Bereich | petanque-online.de | PTM Online |
|---|---|---|
| **Kalender** Liste, Status-Badges („x von y frei“, „Anmeldung ab …“, Warteliste, ausgebucht) | ✅ | ✅ |
| Filter nach Bundesland bzw. Landesverband plus SEO-Seiten je Bundesland | ✅ | ➖ bewusst nicht: PTM Online ist international, Umkreissuche statt länderspezifischer Regionen (Entscheidung 21.10.2026) |
| Umkreissuche, Monat/Formation/System-Filter, gespeicherte Suchen | ❌ bzw. einfach | ✅ |
| „In meinen Kalender“ (ICS) auf der Detailseite | ✅ | ✅ seit 21.10.2026: 📅 „Kalendereintrag erstellen“ (iOS öffnet Kalender, Android Google Calendar, PC ICS-Download), auch bei Kalendereinträgen |
| **Ausschreibung** Anmeldestart/-schluss mit Uhrzeit, Kontingent, Warteliste | ✅ | ✅ |
| Anmeldemodus „Mit Auswahl“: alles erst „Eingegangen“, Auswahl nach Schluss | ✅ | ⚠️ (Approval und VIP vorhanden, aber nicht als eigener Modus) |
| Max. Nachrücker-Teams (begrenzte Warteliste) | ✅ | ❌ (Warteliste nur an/aus) |
| Bevorzugte Anmeldungen (Setzliste, Vorrang bei vollem Turnier) | ❌ | ✅ seit 08.11.2026: VIP-Stufen Gold/Silber/Bronze, verdrängen nur niedrigere Stufen; Warteliste und Nachrücken nach Stufe, dann Meldezeit |
| Öffentliche Warteliste bzw. „Wartet auf Bestätigung“ | ✅ | ✅ seit 25.10.2026: öffentliche Teilnehmerliste mit eigenem Abschnitt für unbestätigte Meldungen und Gesamtzahl |
| **Automatisches Nachrücken** bei Abmeldung, manuelle Reihenfolge, Warteliste öffentlich | ✅ | ✅ seit 21.10.2026: Option „Automatisch von der Warteliste nachrücken“ (Standard an), bis Turnierstart, Team per Mail + Postbox; keine manuelle Reihenfolge (Meldereihenfolge) |
| Double-Opt-In per Mail bei Gastanmeldung, E-Mail nur einmal je Turnier | ⚠️ korrigiert 12.11.2026: öffentlich nur beim freiwilligen Spielerkonto belegt (Bestätigungslink, Verfall nach 48 h ohne Erinnerung, Link nur als Hash, einmalig); für Turnieranmeldungen weder im Formular noch in der Datenschutzerklärung beschrieben, dort nur Bestätigung durch den Verein (sofort oder Auswahl) | ⚠️ geprüft 12.11.2026: Gastanmeldung ohne Konto weiterhin ohne Double-Opt-In; doppelte Anmeldungen seit 25.10.2026 atomar abgewiesen (gleiche Spieler bzw. identische Wiederholung) |
| Telefon Pflicht/optional, Lizenz nicht/optional/Pflicht | ✅ | ✅ Telefon seit 21.10.2026: eine Kontaktnummer pro Anmeldung, optional (Standard) oder Pflicht, aus dem Profil vorbelegt, nur für die Turnierleitung sichtbar. Lizenz bewusst weiter Ja/Nein (Standard Nein) |
| Mail an Veranstalter bei jeder An- und Abmeldung | ✅ | ✅ bewusst nur Postbox (Entscheidung 21.10.2026): Anmeldung und seit 21.10.2026 auch jede Abmeldung durch das Team (Link oder „Absagen“) |
| Erinnerungsmail mit frei wählbarem Datum und Uhrzeit | ✅ | ⚠️ (fester täglicher Cron) |
| Bankverbindung des Vereins in den Mails (Startgeld überweisen) | ✅ | ✅ seit 21.10.2026 als freies Feld „Zahlungshinweise“ am Turnier (international: IBAN, PayPal, Twint, Bizum, bar …), auf der Turnierseite und in Bestätigungs-, Eingangs- und Erinnerungsmail |
| Spielort-GPS aus den Vereinsdaten, Navigation in der Mail | ✅ | ✅ |
| Zusatzfragen, ermäßigte Tarife, Flyer-Generator, eigener QR-Code, Mehrsprachigkeit, PWA, Push | ❌ | ✅ (seit 08.11.2026 auch Auswahlfragen mit Pflichtauswahl; seit 28.10.2026 Italienisch als sechste Sprache) |
| **Verein** Club Master und Club Manager per Mail einladen | ✅ | ✅ (Vereinsbearbeiter) |
| **Spielerdatenbank** des Vereins (Import/Export, Lizenz, Löschfrist, letzte Teilnahme) | ✅ | ❌ |
| E-Mail-Protokoll pro Verein (Status, Typ) | ✅ | ⚠️ seit 25.10.2026 Zustellstatistik und Verlauf nur für Admins, nicht pro Verein |
| **Turniersoftware** Setup-Assistent (Basis → System → Teams → Check-In → Abschluss) | ✅ | ⚠️ „Turnier starten“ mit Teilnehmerliste, Turnieroptionen (seit 09.11.2026 wie im Hauptprojekt) und Ankündigung; dazu „Schnellstart“ mit Vorlagen (seit 28.10.2026); kein geführter Assistent |
| Check-In am Spieltag, Startnummern, Liste zur Lizenzprüfung | ✅ | ⚠️ Teilnehmer unter „Turnier starten“ einzeln oder „Alle aktivieren/deaktivieren“ (seit 26.10.2026), Spieler nachmelden mit Namenssuche; feste Teamnummer ab Anmeldung (seit 09.11.2026, wie Meldeliste im Hauptprojekt); keine druckbare Check-In-/Lizenzliste |
| AB-KO (Schweizer oder 4er-Gruppen mit Barrage als Vorrunde → A/B-Turnier) | ✅ | ❌ online (nur `poule_ab` als Kalender-Label; seit 24.10.2026 als „nicht online durchführbar“ markiert mit Hinweis auf PTM Desktop) |
| Schweizer, Formule X, Zufall, Supermêlée in drei Varianten | ✅ | ✅ (Schweizer, Formule X, Supermêlée, JgJ, KO) |
| Wertungen BHP, FBHP, DP, SEP, direkter Vergleich, Freilos-Wertung frei einstellbar | ✅ | ⚠️ geprüft 12.11.2026: feste Reihenfolge wie im Hauptprojekt (Siege, BHZ/FBHZ beim Schweizer, Spiel- und Punktedifferenz, erzielte Punkte), BHZ/FBHZ ganzzahlig; einstellbar sind Freilos-Plus/Minuspunkte, Freilos-Buchholz (null/neutral, Issue #38) und nicht gespielte Runde; kein direkter Vergleich, keine frei wählbare Reihenfolge |
| **Spielfeldpläne** (Bahnen, Nummerierung, Terrain-Typen, Gruppen, Bahnen sperren), Bahnzuteilung | ✅ | ⚠️ seit 09.11.2026 Bahnzuteilung je Runde wie im Hauptprojekt (keine/laufende Nr., händisch, 1..n, zufällig; doppelte Bahnen rot); kein Spielfeldplan mit Terrain-Typen, Gruppen oder gesperrten Bahnen |
| Ankündigung („Mittagspause bis 13 Uhr“) an alle Live-Link-Nutzer | ✅ | ✅ seit 21.10.2026: Banner in Live-Teamsicht und auf der Turnierseite, Live-Push an Abonnenten, bis Löschen oder Turnierende; gepflegt unter „Turnier starten“ |
| Druck-Dokumente: Check-In-Liste, Starterliste, Excel-Export, QR-Karten je Team, QR-Code Anmeldung, Zuschauer-Live-Link, Foto-Hinweis | ✅ | ⚠️ CSV-Export, Ranglisten-PDF (seit 28.10.2026 zweizeiliger Kopf), QR-Code der Turnierseite in neuem Design; QR-Code zur Live-Ansicht pro Meldung als Dialog zum Zeigen/Teilen (seit 28.10.2026), aber keine druckbaren Team-Karten; Zuschauer-Link ✅ (siehe unten); keine Check-In-/Starterliste als PDF |
| **Turnierserien-Auswertung** über mehrere Turniere als PDF | ✅ | ❌ |
| Live-Ansicht für Spieler, Ergebnis selbst melden, Push | ⚠️ | ✅ (seit 27.10.2026 meldet nur das Siegerteam; seit 08.11.2026 „Meine Partien“ als Tabelle, Begegnungs- und Teamnummern) |
| Zuschauer-/Bildschirm-Anzeige ohne Anmeldung | ✅ | ✅ seit 24.10./08.11.2026: Anzeige-Link mit eigenem Schlüssel (auch für private Turniere, unabhängig von der veröffentlichten Teilnehmerliste), mit QR-Code unter „Turnier starten“; zeigt Meldeliste vor Runde 1, Spielplan live, Endrangliste |
| Endrangliste verteilen | ⚠️ (PDF) | ✅ seit 08.–11.11.2026: Mail an alle Teams (auch mitspielende Turnierleitung), privater Freigabe-Link, eigenes QR-Panel mit Teilen nach Turnierabschluss |
| Öffentlicher Spielplan, aktualisiert sich selbst | ✅ (Zuschauer-Live-Link) | ✅ seit 21.10.2026: Tab „Spielplan“ mit aktueller Runde, Rangliste und vergangenen Runden, lädt alle 2 Minuten neu (Live-Ansicht ebenfalls 2 Minuten); seit 30.10.2026 Sofort-Aktualisierung per WebSocket (Durable Object `TournamentLiveHub`) bei jeder Änderung, Polling dann nur alle 10 Minuten als Sicherheitsnetz; Board-Push-Schalter entfallen |
| Plätze/Vereinssuche mit Karte, Platzvermietung, Mitspielerbörse, Desktop-Sync, Pétanque-Aktuell-Import | ❌ | ✅ |

## Priorisierte Lücken (Vorschlag)

**P1 – Anmeldung (gehört zum Kern, überschaubarer Aufwand)**
1. ~~Automatisches Nachrücken aus der Warteliste~~ (umgesetzt 21.10.2026) mit Mail an den Nachrücker, Modus automatisch/manuell, max. Anzahl Nachrücker, Warteliste wahlweise öffentlich. Betroffen: `src/registration-core.js`, Abmelde-Pfade in `src/worker.js` (cancel-by-token, Absagen), `src/pages/TournamentManagement.jsx`, neue Migration mit ADD COLUMN (kein Table-Rebuild!).
2. ~~Bundesland- bzw. Landesverbands-Filter im Kalender~~ – verworfen (21.10.2026): PTM Online ist international; die Umkreissuche deckt die regionale Suche länderunabhängig ab.
3. ~~Bankverbindung beim Verein bzw. Turnier~~ (umgesetzt 21.10.2026 als freie „Zahlungshinweise“) und Anzeige in der Bestätigungsmail (`sendTransactionalEmail`-Templates).
4. ~~Telefon- und Lizenzabfrage dreistufig~~ – Telefon umgesetzt (optional/Pflicht, 21.10.2026), Lizenz bleibt Ja/Nein; An-/Abmeldung meldet die Postbox der Turnierleitung (ohne Mail).
5. ~~„In meinen Kalender“-Button~~ (umgesetzt 21.10.2026) (ICS-Download) auf `src/pages/TournamentDetailPage.jsx`. Den vorhandenen ICS-Generator aus dem Mailversand wiederverwenden.

**P2 – Turniertag**
6. Check-In am Spieltag: Aktivieren/Deaktivieren und feste Teamnummern vorhanden (26.10./09.11.2026); offen ist nur die druckbare Check-In-/Starterliste (PDF analog `src/lib/ranking-pdf.js`).
7. ~~Ankündigungs-Banner in der Live-Ansicht~~ (umgesetzt 21.10.2026) (`src/pages/PlayerLivePage.jsx`) plus Push.
8. ~~Bahnzuteilung bei der Auslosung~~ (umgesetzt 09.11.2026 als Turnieroption „Spielbahn“); offen: Spielfeldplan mit gesperrten Bahnen bzw. Terrain-Gruppen.
9. ~~Zuschauer-Live-Link~~ (umgesetzt als Anzeige-Link, 24.10./08.11.2026); offen: druckbare QR-Karten je Team (QR-Code pro Meldung gibt es bisher nur als Dialog).

**P2b – neu aus dem Abgleich vom 12.11.2026**
- Erinnerungsmail mit frei wählbarem Zeitpunkt statt festem täglichem Cron.
- Max. Anzahl Nachrücker-Teams (begrenzte Warteliste).

**P3 – größere Systeme (Logik gemäß Hauptprojekt verbindlich)**
10. AB-KO bzw. Poule A/B online spielbar (Vorrunde Schweizer oder 4er-Poules mit Barrage → A/B-KO) als neue Strategie in `src/lib/pairing/index.js`.
11. Turnierserien-Auswertung (Liga bzw. Winterrunde) über mehrere abgeschlossene Turniere.
12. Spielerdatenbank des Vereins mit Import/Export und E-Mail-Protokoll pro Verein.

**P4 – optional, über petanque-online.de hinaus**
- Double-Opt-In für Gastanmeldungen ohne Konto (Bestätigungslink per Mail, unbestätigte Meldung verfällt). Keine Lücke, da petanque-online.de das nur beim Spielerkonto macht; als Vorlage taugt deren Ablauf (ein Link, Verfall ohne Erinnerung, Hash, einmalig).

Bewusst nicht übernehmen: den Modus „Mit Auswahl“, denn VIP und Approval decken das größtenteils ab.

