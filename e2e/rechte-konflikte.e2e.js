// Rechte, Negativfälle und Konflikte bei Ergebnismeldungen (Supermêlée Triplette, 12 Spieler = 2 Partien je Runde).
// Drei registrierte Spieler auf zwei Partien: Mindestens zwei von ihnen spielen in Runde 1 in derselben Partie.
import { expect, test } from '@playwright/test';
import { api, expectOk, openAs } from './support/browser.js';
import { ACCOUNTS, ORGANIZER, TOURNAMENTS, liveToken, registrationId } from './support/data.js';
import { openPlay, playerIds, rounds } from './support/flow.js';

const turnier = TOURNAMENTS.rechte;
const SPIELER = [ACCOUNTS.spieler1, ACCOUNTS.spieler2, ACCOUNTS.spieler3];
const meldungVon = (account) => registrationId(turnier, SPIELER.indexOf(account) + 1);
const alsLeitung = (request, method, path, body) => api(request, method, path, { session: ORGANIZER.session, body });

async function liveFormular(page, registration) {
  await page.goto(`/live/${registration}`);
  const karte = page.getByRole('region', { name: 'Aktuelle Partie' });
  await expect(karte.getByRole('button', { name: 'Ergebnis melden' })).toBeVisible();
  return karte;
}

async function melden(karte, own, opponent) {
  await karte.getByLabel('Eigene Punkte').fill(String(own));
  await karte.getByLabel('Gegnerische Punkte').fill(String(opponent));
  await karte.getByRole('button', { name: 'Ergebnis melden' }).click();
}

test.describe.serial('Rechte und Konflikte', () => {
  let leitung;
  const spieler = [];

  test.beforeAll(async ({ browser }) => {
    leitung = await openAs(browser, ORGANIZER.session);
    for (const account of SPIELER) spieler.push(await openAs(browser, account.session));
    await expectOk(alsLeitung(leitung.page.request, 'POST', `/api/tournaments/${turnier.id}/start`));
  });

  test.afterAll(async () => {
    for (const user of [leitung, ...spieler]) await user?.context.close();
  });

  test('Ohne Rechte: keine Runde, kein Ergebnis, kein Start – weder anonym noch mit fremdem Konto', async ({ request }) => {
    for (const session of [null, ACCOUNTS.fremd.session, ACCOUNTS.spieler1.session]) {
      expect((await api(request, 'POST', `/api/tournaments/${turnier.id}/rounds`, { session })).status).toBeGreaterThanOrEqual(401);
      expect((await api(request, 'POST', `/api/tournaments/${turnier.id}/start`, { session })).status).toBeGreaterThanOrEqual(401);
    }
    await expectOk(alsLeitung(request, 'POST', `/api/tournaments/${turnier.id}/rounds`));
    const [match] = (await rounds(request, turnier)).at(-1).matches;
    for (const session of [null, ACCOUNTS.fremd.session, ACCOUNTS.spieler1.session]) {
      const antwort = await api(request, 'PUT', `/api/tournaments/${turnier.id}/matches/${match.id}/result`, { session, body: { scoreA: 13, scoreB: 0 } });
      expect(antwort.status).toBeGreaterThanOrEqual(401);
    }
    // Fremde Meldung über die Live-API: nur eigene, verknüpfte Anmeldungen.
    const fremd = await api(request, 'POST', `/api/live/registrations/${registrationId(turnier, 7)}/result`,
      { session: ACCOUNTS.spieler1.session, body: { ownScore: 13, opponentScore: 0 } });
    expect(fremd.status).toBeGreaterThanOrEqual(400);
    expect((await rounds(request, turnier)).at(-1).matches.every((entry) => entry.scoreA === null)).toBe(true);
  });

  test('Offene Runde: nächste Runde gesperrt, Neu-Auslosen nur ohne Ergebnisse', async () => {
    const { page } = leitung;
    await openPlay(page, turnier);
    await expect(page.getByRole('button', { name: 'Nächste Runde starten', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Aktuelle Runde neu auslosen', exact: true }).click();
    await expect(page.getByText('Runde 1 wurde neu ausgelost.')).toBeVisible();
  });

  test('Zwei Spieler derselben Partie: der zweite bekommt „bereits gemeldet“', async ({ request }) => {
    const [match] = (await rounds(request, turnier)).at(-1).matches
      .filter((entry) => SPIELER.filter((account) => playerIds(entry).includes(meldungVon(account))).length >= 2);
    const [a, b] = SPIELER.filter((account) => playerIds(match).includes(meldungVon(account)));
    const seiteA = spieler[SPIELER.indexOf(a)].page;
    const seiteB = spieler[SPIELER.indexOf(b)].page;

    // B hat die Ansicht schon offen, während A meldet.
    const karteB = await liveFormular(seiteB, meldungVon(b));
    const karteA = await liveFormular(seiteA, meldungVon(a));
    await melden(karteA, 13, 5);
    await expect(karteA.getByText('Ergebnis gemeldet.')).toBeVisible();
    await melden(karteB, 13, 2);
    await expect(karteB.getByText('Für deine Partie wurde bereits ein Ergebnis gemeldet.')).toBeVisible();

    // Die Turnierleitung korrigiert die Spielermeldung (Überschreiben wird per Dialog bestätigt).
    const { page } = leitung;
    await openPlay(page, turnier);
    await expect(page.getByRole('button', { name: 'Aktuelle Runde neu auslosen', exact: true })).toHaveCount(0);
    await page.locator('.play-current-round .play-decided-matches summary').click();
    const zeile = page.locator('.play-current-round .play-match.is-player-reported');
    await zeile.getByLabel('Punkte Team A').fill('11');
    await zeile.getByLabel('Punkte Team B').fill('13');
    await zeile.getByRole('button', { name: 'Ergebnis ändern' }).click();
    await expect.poll(async () => {
      const korrigiert = (await rounds(request, turnier)).at(-1).matches.find((entry) => entry.id === match.id);
      return `${korrigiert.scoreA}:${korrigiert.scoreB}`;
    }).toBe('11:13');
  });

  test('Turnierleitung trägt ein, während der Spieler noch meldet: „bereits eingetragen“', async ({ request }) => {
    for (const match of (await rounds(request, turnier)).at(-1).matches.filter((entry) => entry.scoreA === null)) {
      await expectOk(alsLeitung(request, 'PUT', `/api/tournaments/${turnier.id}/matches/${match.id}/result`, { scoreA: 13, scoreB: 9 }));
    }
    await expectOk(alsLeitung(request, 'POST', `/api/tournaments/${turnier.id}/rounds`));

    const karte = await liveFormular(spieler[0].page, meldungVon(SPIELER[0]));
    const match = (await rounds(request, turnier)).at(-1).matches.find((entry) => playerIds(entry).includes(meldungVon(SPIELER[0])));
    await expectOk(alsLeitung(request, 'PUT', `/api/tournaments/${turnier.id}/matches/${match.id}/result`, { scoreA: 7, scoreB: 13 }));
    await melden(karte, 13, 0);
    await expect(karte.getByText('Die Turnierleitung hat das Ergebnis deiner Partie bereits eingetragen.')).toBeVisible();
    await expect(karte.locator('.live-score')).toHaveText(/^(7:13|13:7)$/);
  });

  test('Ungültiger und neu ausgestellter Live-Link', async ({ browser, request }) => {
    const anonym = await openAs(browser);
    await anonym.page.goto(`/live/t/${'0'.repeat(64)}`);
    await expect(anonym.page.getByText('Für diese Anmeldung gibt es keine Live-Ansicht.')).toBeVisible();

    const alt = liveToken(turnier, 4);
    expect((await api(request, 'GET', `/api/live/token/${alt}`)).status).toBe(200);
    expect(await expectOk(alsLeitung(request, 'POST', `/api/registrations/${registrationId(turnier, 4)}/live-link`))).toEqual({ sent: 1 });
    expect((await api(request, 'GET', `/api/live/token/${alt}`)).status).toBe(404);
    await anonym.page.goto(`/live/t/${alt}`);
    await expect(anonym.page.getByText('Für diese Anmeldung gibt es keine Live-Ansicht.')).toBeVisible();

    // Dass der neue Link (nur per Mail zugestellt) gilt, prüft src/worker.live-link.test.js.
    await anonym.context.close();
  });

  test('Nach dem Abschluss: keine neue Runde, keine Spielermeldung', async ({ request }) => {
    await expectOk(alsLeitung(request, 'PUT', `/api/tournaments/${turnier.id}/publication`, { status: 'finished', visibility: 'public' }));
    const runde = await alsLeitung(request, 'POST', `/api/tournaments/${turnier.id}/rounds`);
    expect(runde.status).toBe(400);
    expect(runde.json.error).toContain('Status "Läuft"');
    const meldung = await api(request, 'POST', `/api/live/registrations/${meldungVon(SPIELER[1])}/result`,
      { session: ACCOUNTS.spieler2.session, body: { ownScore: 13, opponentScore: 0 } });
    expect(meldung.status).toBe(409);
  });
});

test.describe('Ohne Live-Freischaltung und ohne Spielermeldung', () => {
  const ohneLive = TOURNAMENTS.ohneLive;

  test('Live-Link zeigt nur den Status, Konto-Ansicht bietet keine Meldung, Server lehnt Meldung ab', async ({ browser, request }) => {
    await expectOk(api(request, 'POST', `/api/tournaments/${ohneLive.id}/start`, { session: ORGANIZER.session }));
    await expectOk(api(request, 'POST', `/api/tournaments/${ohneLive.id}/rounds`, { session: ORGANIZER.session }));

    const token = await expectOk(api(request, 'GET', `/api/live/token/${liveToken(ohneLive, 4)}`));
    expect(token.tournament.liveViewEnabled).toBe(false);
    expect(token.live).toBeNull();

    const user = await openAs(browser, ACCOUNTS.spieler1.session);
    await user.page.goto(`/live/${registrationId(ohneLive, 1)}`);
    await expect(user.page.getByText(ohneLive.name).first()).toBeVisible();
    await expect(user.page.getByRole('button', { name: 'Ergebnis melden' })).toHaveCount(0);
    await user.context.close();

    const meldung = await api(request, 'POST', `/api/live/registrations/${registrationId(ohneLive, 1)}/result`,
      { session: ACCOUNTS.spieler1.session, body: { ownScore: 13, opponentScore: 0 } });
    expect(meldung.status).toBe(403);
  });
});
