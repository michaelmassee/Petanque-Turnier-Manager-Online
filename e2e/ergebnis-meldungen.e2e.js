// Kommen Ergebnismeldungen der Teams richtig an – auch bei Konflikten? Supermêlée Triplette mit 12 Spielern
// (2 Partien je Runde), jeder Spieler hat ein Konto. Nach jeder Meldung muss dasselbe Ergebnis überall stehen:
// im Server, in der offenen Spielverwaltung, auf der offenen Turnierseite und in den Live-Ansichten beider Teams
// (dort aus eigener Sicht). „Eigene/gegnerische Punkte“ werden je nach Team auf Team A/B umgerechnet.
// Melden darf nur das Siegerteam; wer zuerst meldet, gilt – bis die Turnierleitung korrigiert.
import { expect, test } from '@playwright/test';
import { api, expectOk, openAs } from './support/browser.js';
import { MELDER, ORGANIZER, TOURNAMENTS } from './support/data.js';
import { openPlay, rounds } from './support/flow.js';

const turnier = TOURNAMENTS.meldungen;
const KONTO = new Map(MELDER.map((account, index) => [`${turnier.id}-r${String(index + 1).padStart(3, '0')}`, account]));
const alsLeitung = (request, method, path, body) => api(request, method, path, { session: ORGANIZER.session, body });
const BEREITS_GEMELDET = 'Für deine Partie wurde bereits ein Ergebnis gemeldet.';

test.describe.serial('Ergebnismeldungen der Teams', () => {
  let leitung;
  let turnierseite;
  const spieler = new Map();

  // Eigener Browser-Kontext je Spieler, erst bei Bedarf.
  async function seiteVon(browser, player) {
    if (!spieler.has(player.id)) spieler.set(player.id, await openAs(browser, KONTO.get(player.id).session));
    return spieler.get(player.id).page;
  }

  const aktuelleRunde = async (request) => (await rounds(request, turnier)).at(-1);
  const name = (player) => player.teamLabel;

  async function rundeStarten(request, roundNumber) {
    await expectOk(alsLeitung(request, 'POST', `/api/tournaments/${turnier.id}/rounds`));
    await leitungAktualisieren();
    await expect(leitung.page.locator('.play-current-round h2')).toHaveText(`Runde ${roundNumber}`);
    await turnierseite.page.getByRole('button', { name: 'Aktualisieren' }).click();
    await expect(turnierseite.page.getByRole('heading', { name: `Runde ${roundNumber}` })).toBeVisible();
    return aktuelleRunde(request);
  }

  // Öffnet das Meldeformular der Live-Ansicht (vor einer Meldung anderer, also mit veraltetem Stand).
  async function formular(browser, player) {
    const page = await seiteVon(browser, player);
    await page.goto(`/live/${player.id}`);
    const karte = page.getByRole('region', { name: 'Aktuelle Partie' });
    await expect(karte.getByRole('button', { name: 'Ergebnis melden' })).toBeVisible();
    return karte;
  }

  async function absenden(karte, own, opponent) {
    await karte.getByLabel('Eigene Punkte').fill(String(own));
    await karte.getByLabel('Gegnerische Punkte').fill(String(opponent));
    await karte.getByRole('button', { name: 'Ergebnis melden' }).click();
  }

  async function meldet(browser, player, own, opponent) {
    const karte = await formular(browser, player);
    await absenden(karte, own, opponent);
    await expect(karte.getByText('Ergebnis gemeldet.')).toBeVisible();
  }

  // Partie in der Spielverwaltung (auch im zugeklappten Bereich „Erfasste Ergebnisse“) und auf der Turnierseite.
  const leitungsZeile = (match) => leitung.page.locator('.play-current-round .play-match')
    .filter({ hasText: name(match.teamA[0]) }).filter({ hasText: name(match.teamB[0]) });
  const turnierseitenErgebnis = (match) => turnierseite.page.locator('.display-current-round article.data-row')
    .filter({ hasText: name(match.teamA[0]) }).filter({ hasText: name(match.teamB[0]) }).locator('> div').last();

  async function leitungAktualisieren() {
    await leitung.page.locator('.play-current-round').getByRole('group', { name: 'Rundenaktionen' })
      .getByRole('button', { name: 'Aktualisieren' }).click();
  }

  // Turnierleitung trägt ein oder korrigiert in der offenen Spielverwaltung (Überschreiben bestätigt openAs).
  async function leitungTraegtEin(match, scoreA, scoreB) {
    await leitungAktualisieren();
    const erfasst = leitung.page.locator('.play-current-round .play-decided-matches');
    if (await erfasst.count() && !(await erfasst.evaluate((details) => details.open))) await erfasst.locator('summary').click();
    const zeile = leitungsZeile(match);
    await zeile.getByLabel('Punkte Team A').fill(String(scoreA));
    await zeile.getByLabel('Punkte Team B').fill(String(scoreB));
    await zeile.getByRole('button', { name: /Ergebnis (speichern|ändern)/ }).click();
    await expect(zeile.getByLabel('Punkte Team A')).toHaveValue(String(scoreA));
  }

  // Prüft ein Ergebnis an allen Stellen. gemeldetVon: Spieler der Meldung, null = Eintrag der Turnierleitung,
  // undefined = noch offen.
  async function erwarteUeberall({ browser, request }, match, scoreA, scoreB, gemeldetVon) {
    const offen = gemeldetVon === undefined;
    const server = (await aktuelleRunde(request)).matches.find((entry) => entry.id === match.id);
    expect({ scoreA: server.scoreA, scoreB: server.scoreB, reportedBy: server.reportedBy?.id ?? null })
      .toEqual({ scoreA, scoreB, reportedBy: gemeldetVon?.id ?? null });

    // Spielverwaltung und Turnierseite bleiben offen, „Aktualisieren“ holt den neuen Stand.
    await leitungAktualisieren();
    const zeile = leitungsZeile(match);
    await expect(zeile.getByLabel('Punkte Team A')).toHaveValue(offen ? '' : String(scoreA));
    await expect(zeile.getByLabel('Punkte Team B')).toHaveValue(offen ? '' : String(scoreB));
    if (gemeldetVon) await expect(zeile.locator('.play-report-badge')).toContainText(`Ergebnis gemeldet von ${name(gemeldetVon)}`);
    else await expect(zeile.locator('.play-report-badge')).toHaveCount(0);

    await turnierseite.page.getByRole('button', { name: 'Aktualisieren' }).click();
    await expect(turnierseitenErgebnis(match)).toHaveText(offen ? 'Offen' : `${scoreA}:${scoreB}`);

    // Live-Ansicht aller Spieler beider Teams, jeweils aus eigener Sicht.
    for (const [team, eigene, gegner] of [[match.teamA, scoreA, scoreB], [match.teamB, scoreB, scoreA]]) {
      for (const player of team) {
        const page = await seiteVon(browser, player);
        await page.goto(`/live/${player.id}`);
        const karte = page.getByRole('region', { name: 'Aktuelle Partie' });
        await expect(karte.locator('.live-score')).toHaveText(offen ? 'läuft' : `${eigene}:${gegner}`);
        if (!offen) await expect(karte.getByRole('button', { name: 'Ergebnis melden' })).toHaveCount(0);
      }
    }
  }

  test.beforeAll(async ({ browser }) => {
    leitung = await openAs(browser, ORGANIZER.session);
    turnierseite = await openAs(browser);
    await expectOk(alsLeitung(leitung.page.request, 'POST', `/api/tournaments/${turnier.id}/start`));
    await expectOk(alsLeitung(leitung.page.request, 'POST', `/api/tournaments/${turnier.id}/rounds`));
    // Beide Seiten werden einmal geöffnet und bleiben offen – wie bei Turnierleitung und Bildschirm vor Ort.
    await openPlay(leitung.page, turnier);
    await turnierseite.page.goto(`/turnierseite/${turnier.id}`);
    await expect(turnierseite.page.getByRole('heading', { name: 'Runde 1' })).toBeVisible();
  });

  test.afterAll(async () => {
    for (const user of [leitung, turnierseite, ...spieler.values()]) await user?.context.close();
  });

  test('Runde 1: Sieger aus Team B meldet, wird auf Team A/B umgerechnet und kommt überall an', async ({ browser, request }) => {
    const [match] = (await aktuelleRunde(request)).matches;
    await expect(turnierseitenErgebnis(match)).toHaveText('Offen');
    await meldet(browser, match.teamB[0], 13, 7);

    // Die Spielverwaltung weist auf die neue Meldung hin.
    await leitungAktualisieren();
    await expect(leitung.page.getByRole('status').filter({ hasText: 'Neue Ergebnismeldungen von Teams: 1' })).toBeVisible();
    await erwarteUeberall({ browser, request }, match, 7, 13, match.teamB[0]);
  });

  test('Runde 1: Sieger aus Team A meldet, die Rangliste der Turnierseite zählt beide Meldungen', async ({ browser, request }) => {
    const match = (await aktuelleRunde(request)).matches[1];
    await meldet(browser, match.teamA[1], 13, 11);
    await erwarteUeberall({ browser, request }, match, 13, 11, match.teamA[1]);

    const { ranking } = await expectOk(alsLeitung(request, 'GET', `/api/tournaments/${turnier.id}/ranking?live=1`));
    const sieger = (await aktuelleRunde(request)).matches.flatMap((entry) => (entry.scoreA > entry.scoreB ? entry.teamA : entry.teamB));
    expect(sieger).toHaveLength(6);
    for (const player of sieger) expect(ranking.find((entry) => entry.id === player.id)).toMatchObject({ wins: 1 });
    const rangliste = turnierseite.page.locator('.display-ranking');
    for (const player of sieger) await expect(rangliste.getByRole('row').filter({ hasText: name(player) }).getByRole('cell').nth(2)).toHaveText('1');
  });

  test('Runde 2: Verlierer kann nicht melden – weder im Formular noch direkt beim Server', async ({ browser, request }) => {
    const [match] = (await rundeStarten(request, 2)).matches;
    const verlierer = match.teamB[0];
    const karte = await formular(browser, verlierer);
    await karte.getByLabel('Eigene Punkte').fill('9');
    await karte.getByLabel('Gegnerische Punkte').fill('13');
    await expect(karte.getByText('Nur das Siegerteam meldet das Ergebnis.')).toBeVisible();
    await expect(karte.getByRole('button', { name: 'Ergebnis melden' })).toBeDisabled();

    for (const body of [{ ownScore: 9, opponentScore: 13 }, { ownScore: 13, opponentScore: 13 }, { ownScore: 14, opponentScore: 2 }, { ownScore: '', opponentScore: 13 }]) {
      const antwort = await api(request, 'POST', `/api/live/registrations/${verlierer.id}/result`, { session: KONTO.get(verlierer.id).session, body });
      expect(antwort.status, JSON.stringify(body)).toBe(400);
    }
    await erwarteUeberall({ browser, request }, match, null, null, undefined);
  });

  test('Runde 2: zwei Mitspieler desselben Teams melden gleichzeitig – die erste Meldung gilt', async ({ browser, request }) => {
    const [match] = (await aktuelleRunde(request)).matches;
    const [erster, zweiter] = match.teamA;
    const karteZweiter = await formular(browser, zweiter);
    await meldet(browser, erster, 13, 6);
    // Der Mitspieler hatte die Ansicht schon offen und meldet einen anderen Stand.
    await absenden(karteZweiter, 13, 4);
    await expect(karteZweiter.getByText(BEREITS_GEMELDET)).toBeVisible();

    await erwarteUeberall({ browser, request }, match, 13, 6, erster);
    // Ein erneuter Versuch desselben Spielers wird ebenfalls abgewiesen.
    const doppelt = await api(request, 'POST', `/api/live/registrations/${erster.id}/result`, { session: KONTO.get(erster.id).session, body: { ownScore: 13, opponentScore: 0 } });
    expect(doppelt.status).toBe(409);
    await erwarteUeberall({ browser, request }, match, 13, 6, erster);
  });

  test('Runde 2: beide Teams halten sich für den Sieger – erste Meldung gilt, die Turnierleitung korrigiert', async ({ browser, request }) => {
    const match = (await aktuelleRunde(request)).matches[1];
    const teamA = match.teamA[2];
    const teamB = match.teamB[2];
    const karteA = await formular(browser, teamA);
    await meldet(browser, teamB, 13, 10);
    await absenden(karteA, 13, 8);
    await expect(karteA.getByText(BEREITS_GEMELDET)).toBeVisible();
    await erwarteUeberall({ browser, request }, match, 10, 13, teamB);

    // Die Turnierleitung klärt den Streit zugunsten von Team A; die Meldung von Team B ist danach weg.
    await leitungTraegtEin(match, 13, 8);
    await erwarteUeberall({ browser, request }, match, 13, 8, null);
  });

  test('Runde 3: Turnierleitung trägt ein, während das Siegerteam noch meldet – ihr Eintrag gilt', async ({ browser, request }) => {
    const [match, zweite] = (await rundeStarten(request, 3)).matches;
    const karte = await formular(browser, match.teamB[1]);
    await leitungTraegtEin(match, 13, 5);
    await absenden(karte, 13, 9);
    await expect(karte.getByText('Die Turnierleitung hat das Ergebnis deiner Partie bereits eingetragen.')).toBeVisible();
    await expect(karte.locator('.live-score')).toHaveText('5:13');
    await erwarteUeberall({ browser, request }, match, 13, 5, null);

    // Die zweite Partie meldet das Siegerteam regulär; danach ist die Runde komplett.
    await meldet(browser, zweite.teamB[1], 13, 12);
    await erwarteUeberall({ browser, request }, zweite, 12, 13, zweite.teamB[1]);
  });

  test('Rangliste der Turnierseite stimmt nach allen Konflikten mit dem Server überein', async ({ request }) => {
    const { ranking } = await expectOk(alsLeitung(request, 'GET', `/api/tournaments/${turnier.id}/ranking?live=1`));
    expect(ranking).toHaveLength(12);
    // Gegenrechnung aus den gespeicherten Partien: Siege je Spieler.
    const siege = new Map();
    for (const match of (await rounds(request, turnier)).flatMap((round) => round.matches)) {
      for (const player of match.scoreA > match.scoreB ? match.teamA : match.teamB) siege.set(player.id, (siege.get(player.id) || 0) + 1);
    }
    await turnierseite.page.getByRole('button', { name: 'Aktualisieren' }).click();
    const rangliste = turnierseite.page.locator('.display-ranking');
    for (const entry of ranking) {
      expect(entry.wins, entry.teamLabel).toBe(siege.get(entry.id) || 0);
      await expect(rangliste.getByRole('row').filter({ hasText: entry.teamLabel }).getByRole('cell').nth(2)).toHaveText(String(entry.wins));
    }
  });
});
