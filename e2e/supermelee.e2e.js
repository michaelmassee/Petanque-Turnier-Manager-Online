// Supermêlée Triplette mit 18 Spielern von der Anmeldung bis zur Endrangliste: Turnierleitung (Login über das
// Formular), drei registrierte Spieler (Live-Ansicht mit Konto) und anonyme Spieler (persönlicher Live-Link).
import { expect, test } from '@playwright/test';
import { api, expectNoHorizontalScroll, expectOk, openAs, openMobile, testUserPassword } from './support/browser.js';
import { ACCOUNTS, ORGANIZER, TOURNAMENTS, liveToken, registrationId } from './support/data.js';
import {
  currentMatchOf, enterOpenResults, finishTournament, openPlay, playerIds, reportAsPlayer, rounds, startRound, startTournament,
} from './support/flow.js';

const turnier = TOURNAMENTS.supermelee;
const SPIELER = [ACCOUNTS.spieler1, ACCOUNTS.spieler2, ACCOUNTS.spieler3];

test.describe.serial('Supermêlée: kompletter Turnierablauf', () => {
  let leitung;
  let anonym;
  const spieler = [];

  test.beforeAll(async ({ browser }) => {
    leitung = await openAs(browser);
    anonym = await openAs(browser);
    for (const account of SPIELER) spieler.push(await openAs(browser, account.session));
  });

  test.afterAll(async () => {
    for (const user of [leitung, anonym, ...spieler]) await user?.context.close();
  });

  test('Turnierseite vor dem Start: öffentlich mit allen 18 Meldungen', async () => {
    const { page } = anonym;
    await page.goto(`/turniere/${turnier.id}`);
    await expect(page.getByRole('heading', { name: turnier.name })).toBeVisible();
    await page.goto(`/turniere/${turnier.id}/teilnehmer`);
    for (const account of SPIELER) await expect(page.getByText(`${account.first_name} ${account.last_name}`)).toBeVisible();
    const teilnehmer = await expectOk(api(page.request, 'GET', `/api/tournaments/${turnier.id}/participants`));
    expect(teilnehmer.participants ?? teilnehmer.registrations).toHaveLength(18);
  });

  test('Live-Ansicht vor dem Start: Spieler sehen ihre Anmeldung, noch keine Runde', async () => {
    await anonym.page.goto(`/live/t/${liveToken(turnier, 4)}`);
    await expect(anonym.page.getByText('Das Turnier hat noch nicht begonnen.')).toBeVisible();
    await spieler[0].page.goto(`/live/${registrationId(turnier, 1)}`);
    await expect(spieler[0].page.getByText('Das Turnier hat noch nicht begonnen.')).toBeVisible();
  });

  test('Turnierleitung meldet sich über das Formular an und startet das Turnier', async () => {
    const { page } = leitung;
    await page.goto('/');
    await page.getByRole('button', { name: /Menü/ }).first().click();
    await page.getByRole('button', { name: 'Anmelden', exact: true }).first().click();
    await page.getByLabel('E-Mail').fill(ORGANIZER.email);
    await page.locator('input[type="password"]').fill(testUserPassword());
    await page.locator('form').getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.getByText('Angemeldet.')).toBeVisible();

    await openPlay(page, turnier);
    await startTournament(page);
  });

  for (const roundNumber of [1, 2, 3]) {
    test(`Runde ${roundNumber}: Auslosung, Spielermeldung, Rest durch die Turnierleitung`, async () => {
      const { page } = leitung;
      await openPlay(page, turnier);
      await startRound(page, roundNumber);

      const runde = (await rounds(page.request, turnier)).at(-1);
      expect(runde.roundNumber).toBe(roundNumber);
      expect(runde.matches).toHaveLength(3);
      const ids = runde.matches.flatMap(playerIds);
      expect(ids).toHaveLength(18);
      expect(new Set(ids).size).toBe(18);
      for (const match of runde.matches) {
        expect(match.teamA).toHaveLength(3);
        expect(match.teamB).toHaveLength(3);
      }

      // Je Runde meldet ein anderer registrierter Spieler über seine Live-Ansicht mit Konto.
      const melder = roundNumber - 1;
      const melderId = registrationId(turnier, melder + 1);
      await reportAsPlayer(spieler[melder].page, melderId, 13, 4 + roundNumber);

      // Anonymer Spieler über den Live-Link: sieht seine Partie, kann aber nicht melden.
      await anonym.page.goto(`/live/t/${liveToken(turnier, 4)}`);
      const karte = anonym.page.getByRole('region', { name: 'Aktuelle Partie' });
      await expect(karte.locator('.live-round')).toHaveText(`Runde ${roundNumber}`);
      await expect(karte.getByRole('button', { name: 'Ergebnis melden' })).toHaveCount(0);

      // Die Turnierleitung sieht die Spielermeldung (nach dem Neuladen unter „Erfasste Ergebnisse“) und trägt die
      // übrigen Partien ein. Die App entfernt ?tab=play aus der Adresse, daher erneut per Deep-Link.
      await openPlay(page, turnier);
      const name = `${SPIELER[melder].first_name} ${SPIELER[melder].last_name}`;
      await expect(page.locator('.play-current-round .play-match.is-player-reported .play-report-badge')).toContainText(`Ergebnis gemeldet von ${name}`);
      await expect(page.locator('.play-current-round .play-decided-matches .counter')).toHaveText('1');
      await enterOpenResults(page);

      const fertig = (await rounds(page.request, turnier)).at(-1);
      expect(fertig.matches.every((match) => match.scoreA !== null && match.scoreB !== null)).toBe(true);
      const gemeldet = await currentMatchOf(page.request, turnier, melderId);
      expect(gemeldet.reportedBy).toBeTruthy();

      // Die Live-Ansichten zeigen das Ergebnis.
      await anonym.page.reload();
      await expect(karte.locator('.live-score')).toHaveText(/^\d+:\d+$/);
      await spieler[melder].page.reload();
      await expect(spieler[melder].page.getByRole('region', { name: 'Meine Partien' }).getByText(`Runde ${roundNumber}`)).toBeVisible();
    });
  }

  test('Registrierter Spieler über den Live-Link: Ansicht ohne Meldeformular', async () => {
    const { page } = spieler[0];
    await page.goto(`/live/t/${liveToken(turnier, 1)}`);
    await expect(page.getByRole('region', { name: 'Meine Partien' }).getByText('Runde 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ergebnis melden' })).toHaveCount(0);
  });

  test('Turnierseite und Anzeige zeigen Runden und Zwischenrangliste', async () => {
    const ranking = (await expectOk(api(anonym.page.request, 'GET', `/api/tournaments/${turnier.id}/ranking?live=1`, { session: ORGANIZER.session }))).ranking;
    expect(ranking).toHaveLength(18);
    const erster = ranking.find((entry) => entry.rank === 1);

    for (const path of [`/turnierseite/${turnier.id}`, `/turnierseite/${turnier.id}/anzeige`]) {
      await anonym.page.goto(path);
      await expect(anonym.page.getByText('Runde 3').first()).toBeVisible();
      await expect(anonym.page.getByText(erster.teamLabel).first()).toBeVisible();
    }
  });

  test('Abschluss: Turnier beenden und Endrangliste veröffentlichen', async () => {
    const { page } = leitung;
    await openPlay(page, turnier);
    await finishTournament(page);
    await openPlay(page, turnier);
    await page.getByRole('button', { name: /Endrangliste veröffentlichen/ }).click();
    await expect(page.getByText(/Endrangliste veröffentlicht/)).toBeVisible();
    // Ein abgeschlossenes Turnier bietet statt „Turnier starten“ die Wiederaufnahme an.
    await expect(page.getByRole('button', { name: 'Turnier starten', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Turnier wieder aufnehmen', exact: true })).toBeVisible();

    const { json } = await api(page.request, 'GET', `/api/tournaments/${turnier.id}`);
    expect(json.tournament.status).toBe('finished');
    expect(json.tournament.rankingPublishedAt).toBeTruthy();

    await anonym.page.goto(`/turniere/${turnier.id}/rangliste`);
    const ranking = (await expectOk(api(anonym.page.request, 'GET', `/api/tournaments/${turnier.id}/ranking`))).ranking;
    await expect(anonym.page.getByText(ranking[0].teamLabel).first()).toBeVisible();
  });

  test('Live-Ansichten nach dem Abschluss: beendet, Platz sichtbar, keine Meldung mehr', async () => {
    for (const page of [anonym.page, spieler[0].page]) {
      await page.goto(page === anonym.page ? `/live/t/${liveToken(turnier, 4)}` : `/live/${registrationId(turnier, 1)}`);
      await expect(page.getByText('Das Turnier ist beendet.')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Mein Platz' }).locator('.live-place')).toContainText('/ 18');
      await expect(page.getByRole('button', { name: 'Ergebnis melden' })).toHaveCount(0);
    }
    // Nach Abschluss nimmt der Server keine Meldung mehr an.
    const spaet = await api(spieler[1].page.request, 'POST', `/api/live/registrations/${registrationId(turnier, 2)}/result`,
      { session: ACCOUNTS.spieler2.session, body: { ownScore: 13, opponentScore: 0 } });
    expect(spaet.status).toBeGreaterThanOrEqual(400);
  });

  test('Handybreite: Live-Ansicht und Turnierseite ohne horizontales Scrollen', async ({ browser }) => {
    const { context, page } = await openMobile(browser);
    for (const path of [`/live/t/${liveToken(turnier, 4)}`, `/turnierseite/${turnier.id}`]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
    await context.close();
  });
});
