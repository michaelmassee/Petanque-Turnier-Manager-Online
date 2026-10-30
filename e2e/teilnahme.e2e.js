// Teilnahme-Änderungen während des Turniers (Supermêlée Triplette, 17 Spieler = ungerade Aufteilung):
// Spieler aussetzen, Nachzügler aufnehmen (verpasste Runde zählt 0:13), Spieler wieder aktivieren.
import { expect, test } from '@playwright/test';
import { api, expectOk, openAs } from './support/browser.js';
import { ORGANIZER, TOURNAMENTS, liveToken, registrationId } from './support/data.js';
import { openParticipants, openPlay, playerIds, rounds } from './support/flow.js';

const turnier = TOURNAMENTS.teilnahme;
const PAUSIERT = registrationId(turnier, 4);
const alsLeitung = (request, method, path, body) => api(request, method, path, { session: ORGANIZER.session, body });

async function rundeMitErgebnissen(request) {
  await expectOk(alsLeitung(request, 'POST', `/api/tournaments/${turnier.id}/rounds`));
  const runde = (await rounds(request, turnier)).at(-1);
  for (const match of runde.matches.filter((entry) => entry.teamB.length > 0)) {
    await expectOk(alsLeitung(request, 'PUT', `/api/tournaments/${turnier.id}/matches/${match.id}/result`, { scoreA: 13, scoreB: 8 }));
  }
  return runde;
}

// Jeder aktive Spieler genau einmal eingeteilt (Partie oder Freilos).
function expectAlleEinmal(runde, erwartet) {
  const ids = runde.matches.flatMap(playerIds);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.sort()).toEqual([...erwartet].sort());
}

test.describe.serial('Teilnahme-Änderungen', () => {
  let leitung;
  let aktiv;
  let pausiertName;

  test.beforeAll(async ({ browser }) => {
    leitung = await openAs(browser, ORGANIZER.session);
    await expectOk(alsLeitung(leitung.page.request, 'POST', `/api/tournaments/${turnier.id}/start`));
    aktiv = Array.from({ length: turnier.count }, (_, index) => registrationId(turnier, index + 1));
  });

  test.afterAll(async () => {
    await leitung?.context.close();
  });

  test('Runde 1 mit 17 Spielern: alle eingeteilt, keine Doppelungen', async ({ request }) => {
    expectAlleEinmal(await rundeMitErgebnissen(request), aktiv);
  });

  test('Spieler aussetzen und Nachzügler aufnehmen über die Spielverwaltung', async ({ browser, request }) => {
    const { page } = leitung;
    await openPlay(page, turnier);
    await openParticipants(page, 17);
    const name = (await expectOk(alsLeitung(request, 'GET', `/api/tournaments/${turnier.id}/registrations`))).registrations
      .find((entry) => entry.id === PAUSIERT);
    pausiertName = `${name.firstName} ${name.lastName}`;
    // „Ausgesetzt“ gibt es nur im Bearbeiten-Dialog; der Schalter in der Liste wechselt nur aktiv/inaktiv.
    await page.getByRole('button', { name: `${pausiertName} bearbeiten` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Teilnahme' }).selectOption('withdrawn');
    await expect(dialog.getByRole('combobox', { name: 'Teilnahme' })).toHaveValue('withdrawn');
    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.locator('.round-participant-row').filter({ hasText: pausiertName }).getByText('Ausgesetzt')).toBeVisible();

    const formular = page.locator('.quick-player-form');
    await formular.getByLabel('Vorname').fill('Nora');
    await formular.getByLabel('Nachname').fill('Nachzügler');
    await formular.getByRole('button', { name: 'Spieler hinzufügen' }).click();
    await expect(page.locator('.round-participant-list').getByText('Nora Nachzügler')).toBeVisible();

    // Der pausierte Spieler sieht das in seiner Live-Ansicht.
    const anonym = await openAs(browser);
    await anonym.page.goto(`/live/t/${liveToken(turnier, 4)}`);
    await expect(anonym.page.getByText('Du pausierst gerade. Für neue Runden wirst du nicht ausgelost.')).toBeVisible();
    await anonym.context.close();
  });

  test('Rangliste führt den Nachzügler mit 0:13 für die verpasste Runde', async ({ request }) => {
    const { ranking } = await expectOk(alsLeitung(request, 'GET', `/api/tournaments/${turnier.id}/ranking?live=1`));
    const nachzuegler = ranking.find((entry) => entry.teamLabel === 'Nora Nachzügler');
    expect(nachzuegler).toMatchObject({ wins: 0, pointsFor: 0, pointsAgainst: 13 });
  });

  test('Runde 2: ohne den pausierten Spieler, mit Nachzügler', async ({ request }) => {
    const registrations = (await expectOk(alsLeitung(request, 'GET', `/api/tournaments/${turnier.id}/registrations`))).registrations;
    const nachzuegler = registrations.find((entry) => entry.firstName === 'Nora' && entry.lastName === 'Nachzügler');
    aktiv = [...aktiv.filter((id) => id !== PAUSIERT), nachzuegler.id];
    expectAlleEinmal(await rundeMitErgebnissen(request), aktiv);
  });

  test('Runde 3: wieder aktivierter Spieler spielt mit', async ({ request }) => {
    const { page } = leitung;
    await openPlay(page, turnier);
    await openParticipants(page, 18);
    const schalter = page.getByRole('button', { name: `Aktiv: ${pausiertName}` });
    await schalter.click();
    await expect(schalter).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await expectOk(alsLeitung(request, 'GET', `/api/tournaments/${turnier.id}/registrations`)))
      .registrations.find((entry) => entry.id === PAUSIERT).participation).toBe('active');

    aktiv = [...aktiv, PAUSIERT];
    expectAlleEinmal(await rundeMitErgebnissen(request), aktiv);
  });
});
