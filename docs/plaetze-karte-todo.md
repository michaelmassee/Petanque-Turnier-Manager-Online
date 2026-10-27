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

## Nachmessung 27.10. (bis ~09 Uhr UTC)

- D1 ~234 k rows read (26.10. zur gleichen Zeit ~550 k). 80 % davon aus zwei Abfragen: Plätzeliste 29 × ~3.770 Zeilen, Vereinsliste 22 × ~3.590 Zeilen.
- CPU p99 weiter 25–50 ms; `/api/places` ist 879 KB JSON (1.252 Plätze).
- Hauptursache: `src/App.jsx` lud für **jeden Angemeldeten bei jedem App-Start** die volle Plätzeliste (nur für die Spielort-Auswahl im Turnierformular), am Cache vorbei, und nach jedem Tab-Wechsel erneut (react-query `staleTime` 30 s + Fokus-Refetch). Also nicht nur Import-/Testverkehr.

## So funktioniert der Edge-Cache jetzt (seit 27.10.)

- `cachedJsonResponse` (`src/worker.js`) legt die JSON-Antwort per `caches.default` im Cloudflare-Cache ab, getrennt pro Rechenzentrum. Der Browser bekommt `no-store`.
- Vereinsliste `/api/clubs`, Plätzeliste `/api/places` (ohne Suchbegriff) und Mietangebote `/api/rentals`: für **alle** gecacht, auch für Angemeldete. Die Plätzeliste ist nutzerneutral (`liked`/`favorited`/`canEdit` immer false).
- Persönliche Markierungen kommen aus `GET /api/places/personal` (Likes, Favoriten, bearbeitbare Vereine/Plätze, Admin-Flag; wenige Index-Zugriffe) und werden im Client überlagert (`withPersonalPlaceMarks` in `src/lib/domain.js`). Suchen (`q`) lesen weiter aus D1.
- Cache-Schlüssel = Datenversion + Deploy-Kennung: `cache_versions.places` wird per Trigger (Migration 0137) bei jeder Änderung an `clubs`, `boule_places`, `boule_place_likes`, `rental_offers` und an `users.role` erhöht – auch bei direkten SQL-Änderungen (Import-Skripte). Die Deploy-Kennung (`CF_VERSION_METADATA`, Binding `version_metadata`) ändert sich bei jedem Deploy, damit ein geändertes Listenformat nicht aus dem alten Cache kommt.
- Neuaufbau also nur einmal pro Rechenzentrum und Version (Änderung oder Deploy), sonst nie; alle Rechenzentren sehen Änderungen sofort. Favoriten lösen keinen Neuaufbau aus.
- Speicherdauer `PUBLISHED_LISTS_CACHE_SECONDS` = 14 Tage, nur noch Aufräumgrenze. Cloudflare kann Einträge früher verdrängen, dann normaler Neuaufbau.
- Kosten je Abruf: +1 row read (Version per Primärschlüssel).
- Die Spielort-Auswahl im Turnierformular lädt die Plätze erst in der Turnierverwaltung, `staleTime` 10 min, ohne Fokus-Refetch.

## Todo

- [x] 27.10. nachmessen – Last blieb ohne Importe hoch, Ursache s. o.
- [x] Speicherdauer erhöhen → ersetzt durch Versionsschlüssel + 14 Tage.
- [x] Plätzeliste für Angemeldete aufteilen (gemeinsame Liste + `/api/places/personal`).
- [x] Versionsschlüssel statt `cache.delete` (wirkt nur im eigenen Rechenzentrum).
- [ ] Nach Deploy: `wrangler tail --format json` (cpuTime je Pfad) und am Folgetag GraphQL `d1QueriesAdaptiveGroups` – Ziel: Plätze-/Vereinsliste < 30 Aufrufe/Tag.
- [ ] Bei vielen Likes: Like-Zahl aus der gemeinsamen Liste lösen (jedes Like baut die Liste in jedem Rechenzentrum neu).
- [ ] CPU p99 > 10 ms beobachten: welche Pfade sind die Ausreißer?
