// Turnierablauf über die Spielverwaltung (Turnierleitung) und die Live-Ansicht (Spieler).
import { expect } from '@playwright/test';
import { api, expectOk } from './browser.js';
import { ORGANIZER } from './data.js';

// Deep-Link der Push-Nachricht „Ergebnis gemeldet“: öffnet die Rundenverwaltung mit gewähltem Turnier.
export async function openPlay(page, tournament) {
  await page.goto(`/?tab=play&tournament=${encodeURIComponent(tournament.id)}`);
  await expect(page.locator('.play-manage')).toBeVisible();
}

// Teilnehmerliste der laufenden Runde aufklappen und vollständig nachladen. Die Endlosliste lädt beim Hineinscrollen
// auch selbst nach; der Button kann also jederzeit verschwinden – daher nur kurz klicken und bis zur Gesamtzahl wiederholen.
export async function openParticipants(page, expectedCount) {
  const panel = page.locator('.round-participants:not(.melee-teams)');
  await panel.locator('> summary').click();
  const rows = panel.locator('.round-participant-row');
  const mehr = panel.getByRole('button', { name: 'Weitere Einträge laden' });
  await expect(async () => {
    if (await mehr.isVisible()) await mehr.click({ timeout: 1_000 }).catch(() => {});
    await expect(rows).toHaveCount(expectedCount, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

export async function startTournament(page) {
  await page.getByRole('button', { name: 'Turnier starten', exact: true }).click();
  await expect(page.getByText('Turnier wurde gestartet.')).toBeVisible();
}

export async function startRound(page, roundNumber) {
  await page.getByRole('button', { name: roundNumber === 1 ? 'Erste Runde starten' : 'Nächste Runde starten', exact: true }).click();
  await expect(page.locator('.play-current-round h2')).toHaveText(`Runde ${roundNumber}`);
}

// Offene Partien der aktuellen Runde (erfasste wandern in das zugeklappte Panel „Erfasste Ergebnisse“).
export const openMatches = (page) => page.locator('.play-current-round > .play-match-list > .play-match');

export async function saveResultInRow(row, scoreA, scoreB) {
  await row.getByLabel('Punkte Team A').fill(String(scoreA));
  await row.getByLabel('Punkte Team B').fill(String(scoreB));
  await row.getByRole('button', { name: /Ergebnis (speichern|ändern)/ }).click();
}

// Trägt alle noch offenen Partien der aktuellen Runde ein; scoreFor(index) liefert [scoreA, scoreB].
export async function enterOpenResults(page, scoreFor = (index) => [13, index % 13]) {
  let index = 0;
  for (let open = await openMatches(page).count(); open > 0; open -= 1, index += 1) {
    const [scoreA, scoreB] = scoreFor(index);
    await saveResultInRow(openMatches(page).first(), scoreA, scoreB);
    await expect(openMatches(page)).toHaveCount(open - 1);
  }
  await expect(page.getByText('Alle Ergebnisse dieser Runde sind erfasst.')).toBeVisible();
}

export async function finishTournament(page) {
  await page.getByRole('button', { name: 'Turnier abschließen', exact: true }).click();
  await expect(page.getByText(/Turnier abgeschlossen\./)).toBeVisible();
}

// Spieler meldet über die Live-Ansicht mit Konto (/live/<Meldung>) das Ergebnis seiner aktuellen Partie.
export async function reportAsPlayer(page, registrationId, ownScore, opponentScore) {
  await page.goto(`/live/${encodeURIComponent(registrationId)}`);
  const card = page.getByRole('region', { name: 'Aktuelle Partie' });
  await card.getByLabel('Eigene Punkte').fill(String(ownScore));
  await card.getByLabel('Gegnerische Punkte').fill(String(opponentScore));
  await card.getByRole('button', { name: 'Ergebnis melden' }).click();
  await expect(card.getByText('Ergebnis gemeldet.')).toBeVisible();
  // Bis zum „Gesehen“ der Turnierleitung ist die Partie offen; das Team sieht seine Meldung als Hinweis (E-27).
  await expect(card.getByText(`Gemeldet: ${ownScore}:${opponentScore}. Die Turnierleitung bestätigt das Ergebnis.`)).toBeVisible();
  await expect(card.locator('.live-score')).toHaveText('läuft');
  await expect(card.getByRole('button', { name: 'Ergebnis melden' })).toHaveCount(0);
}

// Turnierleitung bestätigt die angezeigten Spielermeldungen; erst dann sind sie öffentlich.
export async function confirmReports(page) {
  const banner = page.getByRole('status').filter({ hasText: 'Neue Ergebnismeldungen von Teams' });
  await banner.getByRole('button', { name: 'Gesehen' }).click();
  await expect(banner).toHaveCount(0);
}

export async function rounds(request, tournament) {
  return (await expectOk(api(request, 'GET', `/api/tournaments/${tournament.id}/rounds`, { session: ORGANIZER.session }))).rounds;
}

export async function currentMatchOf(request, tournament, registrationId) {
  const round = (await rounds(request, tournament)).at(-1);
  return round.matches.find((match) => [...match.teamA, ...match.teamB].some((player) => player.id === registrationId));
}

export const playerIds = (match) => [...match.teamA, ...match.teamB].map((player) => player.id);
