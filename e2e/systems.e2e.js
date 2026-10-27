// Derselbe Ablauf über die Spielverwaltung für die übrigen online durchführbaren Turniersysteme:
// starten, (Mêlée: Teams auslosen), drei Runden mit Ergebnissen, abschließen, Live-Link und Endrangliste prüfen.
import { expect, test } from '@playwright/test';
import { api, expectOk, openAs } from './support/browser.js';
import { ORGANIZER, TOURNAMENTS, liveToken, registrationId } from './support/data.js';
import { enterOpenResults, finishTournament, openPlay, playerIds, rounds, startRound, startTournament } from './support/flow.js';

// Partien je Runde; KO halbiert und spielt in der letzten Runde Finale und Spiel um Platz 3,
// Jeder gegen jeden mit 4 Teams ist nach 3 Runden komplett.
const SYSTEME = [
  { turnier: TOURNAMENTS.melee, partien: [4, 4, 4], melee: true },
  { turnier: TOURNAMENTS.schweizer, partien: [4, 4, 4] },
  { turnier: TOURNAMENTS.formuleX, partien: [4, 4, 4] },
  { turnier: TOURNAMENTS.ko, partien: [4, 2, 2], ende: true, ohneEndrangliste: true, letzteStufen: ['Finale', 'Spiel um Platz 3'] },
  { turnier: TOURNAMENTS.jgj, partien: [2, 2, 2], ende: true },
];

for (const { turnier, partien, melee, ende, ohneEndrangliste, letzteStufen } of SYSTEME) {
  test.describe.serial(turnier.name, () => {
    let leitung;

    test.beforeAll(async ({ browser }) => {
      leitung = await openAs(browser, ORGANIZER.session);
    });

    test.afterAll(async () => {
      await leitung?.context.close();
    });

    test('starten und drei Runden spielen', async () => {
      const { page } = leitung;
      await openPlay(page, turnier);
      await startTournament(page);
      if (melee) {
        await page.getByRole('button', { name: 'Mêlée-Teams auslosen', exact: true }).click();
        await expect(page.locator('.melee-teams .counter')).toHaveText(String(turnier.count / 2));
      }

      for (const [index, anzahl] of partien.entries()) {
        await startRound(page, index + 1);
        const runde = (await rounds(page.request, turnier)).at(-1);
        expect(runde.matches).toHaveLength(anzahl);
        const ids = runde.matches.flatMap(playerIds);
        expect(new Set(ids).size).toBe(ids.length);
        if (letzteStufen && index === partien.length - 1) expect(runde.matches.map((match) => match.stageLabel)).toEqual(letzteStufen);
        await enterOpenResults(page);
      }

      if (ende) {
        await expect(page.getByRole('button', { name: 'Nächste Runde starten', exact: true })).toBeDisabled();
        await expect(page.locator('.round-requirements')).toContainText('Alle Runden wurden bereits gespielt.');
      }
    });

    test('Live-Link zeigt die letzte Runde', async ({ request }) => {
      const live = await expectOk(api(request, 'GET', `/api/live/token/${liveToken(turnier, 4)}`));
      expect(live.registration.id).toBe(registrationId(turnier, 4));
      expect(live.live.lastRoundNumber).toBe(partien.length);
    });

    test('abschließen und Endrangliste veröffentlichen', async ({ request }) => {
      const { page } = leitung;
      await openPlay(page, turnier);
      await finishTournament(page);
      if (ohneEndrangliste) return;
      await openPlay(page, turnier);
      await page.getByRole('button', { name: /Endrangliste veröffentlichen/ }).click();
      await expect.poll(async () => (await expectOk(api(request, 'GET', `/api/tournaments/${turnier.id}`))).tournament.rankingPublishedAt)
        .toBeTruthy();
      const { ranking } = await expectOk(api(request, 'GET', `/api/tournaments/${turnier.id}/ranking`));
      expect(ranking.length).toBeGreaterThan(0);
    });
  });
}
