# Abgleich petanque-online.de ↔ PTM Online (Stand 21.10.2026)

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
| **Automatisches Nachrücken** bei Abmeldung, manuelle Reihenfolge, Warteliste öffentlich | ✅ | ✅ seit 21.10.2026: Option „Automatisch von der Warteliste nachrücken“ (Standard an), bis Turnierstart, Team per Mail + Postbox; keine manuelle Reihenfolge (Meldereihenfolge) |
| Double-Opt-In per Mail bei Gastanmeldung, E-Mail nur einmal je Turnier | ✅ | ⚠️ prüfen (`createRegistration` mit `optionalSession`) |
| Telefon Pflicht/optional, Lizenz nicht/optional/Pflicht | ✅ | ✅ Telefon seit 21.10.2026: eine Kontaktnummer pro Anmeldung, optional (Standard) oder Pflicht, aus dem Profil vorbelegt, nur für die Turnierleitung sichtbar. Lizenz bewusst weiter Ja/Nein (Standard Nein) |
| Mail an Veranstalter bei jeder An- und Abmeldung | ✅ | ✅ bewusst nur Postbox (Entscheidung 21.10.2026): Anmeldung und seit 21.10.2026 auch jede Abmeldung durch das Team (Link oder „Absagen“) |
| Erinnerungsmail mit frei wählbarem Datum und Uhrzeit | ✅ | ⚠️ (fester täglicher Cron) |
| Bankverbindung des Vereins in den Mails (Startgeld überweisen) | ✅ | ✅ seit 21.10.2026 als freies Feld „Zahlungshinweise“ am Turnier (international: IBAN, PayPal, Twint, Bizum, bar …), auf der Turnierseite und in Bestätigungs-, Eingangs- und Erinnerungsmail |
| Spielort-GPS aus den Vereinsdaten, Navigation in der Mail | ✅ | ✅ |
| Zusatzfragen, ermäßigte Tarife, Flyer-Generator, eigener QR-Code, Mehrsprachigkeit, PWA, Push | ❌ | ✅ |
| **Verein** Club Master und Club Manager per Mail einladen | ✅ | ✅ (Vereinsbearbeiter) |
| **Spielerdatenbank** des Vereins (Import/Export, Lizenz, Löschfrist, letzte Teilnahme) | ✅ | ❌ |
| E-Mail-Protokoll pro Verein (Status, Typ) | ✅ | ❌ |
| **Turniersoftware** Setup-Assistent (Basis → System → Teams → Check-In → Abschluss) | ✅ | ⚠️ (Start mit Auto-Check-in, kein expliziter Check-in) |
| Check-In am Spieltag, Startnummern, Liste zur Lizenzprüfung | ✅ | ❌ |
| AB-KO (Schweizer oder 4er-Gruppen mit Barrage als Vorrunde → A/B-Turnier) | ✅ | ❌ online (nur `poule_ab` als Kalender-Label) |
| Schweizer, Formule X, Zufall, Supermêlée in drei Varianten | ✅ | ✅ (Schweizer, Formule X, Supermêlée, JgJ, KO) |
| Wertungen BHP, FBHP, DP, SEP, direkter Vergleich, Freilos-Wertung frei einstellbar | ✅ | ⚠️ prüfen in `src/lib/pairing/ranking.js` |
| **Spielfeldpläne** (Bahnen, Nummerierung, Terrain-Typen, Gruppen, Bahnen sperren), Bahnzuteilung | ✅ | ❌ (Bahnen nur bei der Vermietung) |
| Ankündigung („Mittagspause bis 13 Uhr“) an alle Live-Link-Nutzer | ✅ | ✅ seit 21.10.2026: Banner in Live-Teamsicht und auf der Turnierseite, Live-Push an Abonnenten, bis Löschen oder Turnierende; gepflegt unter „Turnier starten“ |
| Druck-Dokumente: Check-In-Liste, Starterliste, Excel-Export, QR-Karten je Team, QR-Code Anmeldung, Zuschauer-Live-Link, Foto-Hinweis | ✅ | ⚠️ (CSV-Export, Ranglisten-PDF, QR-Code; keine Team-Karten, kein Zuschauer-Link) |
| **Turnierserien-Auswertung** über mehrere Turniere als PDF | ✅ | ❌ |
| Live-Ansicht für Spieler, Ergebnis selbst melden, Push | ⚠️ | ✅ |
| Öffentlicher Spielplan, aktualisiert sich selbst | ✅ (Zuschauer-Live-Link) | ✅ seit 21.10.2026: Tab „Spielplan“ mit aktueller Runde, Rangliste und vergangenen Runden, lädt alle 2 Minuten neu (Live-Ansicht ebenfalls 2 Minuten) |
| Plätze/Vereinssuche mit Karte, Platzvermietung, Mitspielerbörse, Desktop-Sync, Pétanque-Aktuell-Import | ❌ | ✅ |

## Priorisierte Lücken (Vorschlag)

**P1 – Anmeldung (gehört zum Kern, überschaubarer Aufwand)**
1. ~~Automatisches Nachrücken aus der Warteliste~~ (umgesetzt 21.10.2026) mit Mail an den Nachrücker, Modus automatisch/manuell, max. Anzahl Nachrücker, Warteliste wahlweise öffentlich. Betroffen: `src/registration-core.js`, Abmelde-Pfade in `src/worker.js` (cancel-by-token, Absagen), `src/pages/TournamentManagement.jsx`, neue Migration mit ADD COLUMN (kein Table-Rebuild!).
2. ~~Bundesland- bzw. Landesverbands-Filter im Kalender~~ – verworfen (21.10.2026): PTM Online ist international; die Umkreissuche deckt die regionale Suche länderunabhängig ab.
3. ~~Bankverbindung beim Verein bzw. Turnier~~ (umgesetzt 21.10.2026 als freie „Zahlungshinweise“) und Anzeige in der Bestätigungsmail (`sendTransactionalEmail`-Templates).
4. ~~Telefon- und Lizenzabfrage dreistufig~~ – Telefon umgesetzt (optional/Pflicht, 21.10.2026), Lizenz bleibt Ja/Nein; An-/Abmeldung meldet die Postbox der Turnierleitung (ohne Mail).
5. ~~„In meinen Kalender“-Button~~ (umgesetzt 21.10.2026) (ICS-Download) auf `src/pages/TournamentDetailPage.jsx`. Den vorhandenen ICS-Generator aus dem Mailversand wiederverwenden.

**P2 – Turniertag**
6. Check-In am Spieltag mit Startnummern und druckbarer Check-In-Liste (PDF analog `src/lib/ranking-pdf.js`).
7. ~~Ankündigungs-Banner in der Live-Ansicht~~ (umgesetzt 21.10.2026) (`src/pages/PlayerLivePage.jsx`) plus Push.
8. Spielfeldplan und Bahnzuteilung bei der Auslosung.
9. Zuschauer-Live-Link (öffentlich, nur lesend) und QR-Karten je Team.

**P3 – größere Systeme (Logik gemäß Hauptprojekt verbindlich)**
10. AB-KO bzw. Poule A/B online spielbar (Vorrunde Schweizer oder 4er-Poules mit Barrage → A/B-KO) als neue Strategie in `src/lib/pairing/index.js`.
11. Turnierserien-Auswertung (Liga bzw. Winterrunde) über mehrere abgeschlossene Turniere.
12. Spielerdatenbank des Vereins mit Import/Export und E-Mail-Protokoll pro Verein.

Bewusst nicht übernehmen: den Modus „Mit Auswahl“, denn VIP und Approval decken das größtenteils ab.

