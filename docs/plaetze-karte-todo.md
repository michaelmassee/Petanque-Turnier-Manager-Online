# Plätze & Karte – D1-Last und Edge-Cache (Todo)

Stand: 2026-10-26. Anlass: Auslastungsprüfung Workers/D1 der letzten Tage.

## Messwerte (Cloudflare GraphQL)

| Datum | Requests | Fehler | CPU p50 / p99 | D1 rows read | rows written |
|---|---:|---:|---:|---:|---:|
| 19.10. | 9.449 | 0 | 1,0 / 22 ms | 227 k | 1,5 k |
| 20.10. | 8.935 | 0 | 1,8 / 26 ms | 743 k | 3,2 k |
| 21.10. | 8.138 | 0 | 1,9 / 25 ms | 484 k | 1,5 k |
| 22.10. | 6.467 | 0 | 1,1 / 24 ms | 307 k | 0,8 k |
| 23.10. | 8.649 | 0 | 1,6 / 24 ms | 411 k | 1,9 k |
| 24.10. | 6.283 | 0 | 1,9 / 25 ms | 372 k | 1,4 k |
| 25.10. | 5.640 | 0 | 2,1 / 28 ms | 668 k | 10,5 k |
| 26.10. (bis 21 Uhr UTC) | 11.351 | 0 | 1,9 / 45 ms | 2,48 Mio. | 10,6 k |

- Free-Plan-Limits: 100.000 Requests/Tag, 5 Mio. D1 rows read/Tag (Reset 00:00 UTC), 10 ms CPU je Anfrage.
- 26.10.: Spitze 18–21 Uhr UTC (260–350 k rows/h), zeitgleich mit Vereinsimporten (jetzt 1.209 Vereine).
- CPU p99 liegt dauerhaft über 10 ms (bis 45 ms), bisher ohne Fehler.

Teuerste Abfragen am 26.10.:

| rows read | Aufrufe | ≈ Zeilen/Aufruf | Abfrage |
|---:|---:|---:|---|
| 1,45 Mio. | 386 | 3.800 | Plätzeliste `SELECT p.*, c.name AS club_display_name …` (`listBoulePlaces`) |
| 0,50 Mio. | 140 | 3.600 | Vereinskoordinaten `SELECT c.id, c.name, p.latitude …` (`loadPublishedClubs`) |

Jeder Aufruf, der nicht aus dem Cache kommt, wird mit jedem importierten Verein teurer.

Einordnung 26.10.: Der Entwickler war an dem Tag oft angemeldet zum Testen auf der Karte. Jeder dieser Aufrufe liest die Plätzeliste direkt aus D1, etwa 3.800 Zeilen pro Aufruf. Ein guter Teil der 386 Aufrufe ist also Testverkehr. Die Aufteilung lässt sich nachträglich nicht beziffern, weil die D1-Analytics keine Nutzer kennen. Aussagekräftig ist erst ein Tag ohne Importe und ohne Tests.

## So funktioniert der Edge-Cache heute

- `cachedJsonResponse` (`src/worker.js`) legt die JSON-Antwort per `caches.default` im Cloudflare-Cache ab, getrennt pro Rechenzentrum. Der Browser bekommt `no-store`.
- Vereinsliste `/api/clubs`: für **alle** gecacht (enthält nur Name und Koordinaten).
- Plätzeliste `/api/places`: nur **ohne Anmeldung und ohne Suchbegriff** gecacht. Angemeldete bekommen persönliche Felder (`liked`, `favorited`, `editor_user_id`/`owner_id`, Admin-Liste), die man nicht teilen darf. Suchen (`q`) lesen immer aus D1.
- Speicherdauer: `PUBLISHED_CLUBS_TTL_SECONDS = 300` (5 min). Seit e3a0c0a (09.10.) als vorsichtiger Notfallwert gegen das D1-Limit, ohne fachliche Begründung. c6db82b hat ihn für die Plätzeliste übernommen.
- `invalidatePublishedClubs` löscht den Eintrag bei Änderungen an Vereinen und Plätzen, **auch bei Likes und Favoriten**.
- Vermutlich wirkt `cache.delete` nur im eigenen Rechenzentrum (nicht geprüft). Dann begrenzt die Speicherdauer, wie lange andere Rechenzentren veraltete Daten zeigen.

## Ursachen für Aufrufe am Cache vorbei

1. Jedes Rechenzentrum hat einen eigenen, anfangs leeren Cache.
2. Der Eintrag verfällt nach 5 min, also bis zu 12 D1-Abfragen pro Stunde und Rechenzentrum.
3. Jede Änderung leert den Cache, auch ein Like oder Favorit.
4. Angemeldete Nutzer und Suchen lesen bei der Plätzeliste immer aus D1.

## Todo

- [ ] 27.10. abends nachmessen: ist die Last ohne Importe weiter hoch? Wenn nein, ist nichts weiter nötig.
- [ ] Anteil der Plätzeliste-Abfragen aufschlüsseln: anonym, angemeldet, Suche.
- [ ] Speicherdauer für Vereins- und Plätzeliste auf 30–60 min erhöhen (Verzögerung für Anonyme ist vertretbar, die Daten ändern sich selten).
- [ ] Prüfen, ob Likes und Favoriten den Cache leeren müssen oder ob Like-Zahlen für Anonyme etwas veraltet sein dürfen.
- [ ] Plätzeliste für Angemeldete aufteilen: gemeinsame Liste aus dem Cache plus kleine Zusatzabfrage nur für die persönlichen Markierungen (Likes, Favoriten, Bearbeitungsrechte der Person).
- [ ] Prüfen, ob `cache.delete` nur im eigenen Rechenzentrum wirkt; ggf. Versionsschlüssel im Cache-Key statt Löschen.
- [ ] CPU p99 > 10 ms beobachten: welche Pfade sind die Ausreißer?
