import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, openAs } from './support/browser.js';
import { ORGANIZER } from './support/data.js';

const POINT = 'https://www.google.com/maps/place/Punkt/@50.5003813,8.417934,574m/data=!3d50.5000636!4d8.4206376';
const IMPORT_LABEL = 'Koordinaten aus Google Maps importieren';

async function expectCompact(page, dialog) {
  // VisualViewport meldet eine Größenänderung nach dem Layout-Viewport; auf die neue Geometrie warten.
  await expect(async () => {
    await expectNoHorizontalScroll(page);
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.y).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 11);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 11);
    expect(box.width).toBeLessThanOrEqual(420);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }).toPass({ timeout: 3000 });
}

for (const width of [320, 360]) {
  test(`Bouleplatz: Icon und Popup passen bei ${width} px, wenig Höhe und großer Schrift`, async ({ browser }, testInfo) => {
    const { context, page } = await openAs(browser, null, { viewport: { width, height: 640 }, isMobile: true, hasTouch: true });
    try {
      const resolverCalls = [];
      page.on('request', (request) => { if (request.url().includes('/api/locations/google-maps')) resolverCalls.push(request); });
      await page.goto('/platz-melden');
      const trigger = page.getByRole('button', { name: IMPORT_LABEL });
      await expect(trigger).toBeVisible();
      await expect(page.getByLabel('Google-Maps-Link')).toHaveCount(0);
      const icon = await trigger.boundingBox();
      expect(icon.width).toBeGreaterThanOrEqual(44);
      expect(icon.height).toBeGreaterThanOrEqual(44);
      await expect(async () => { await expectNoHorizontalScroll(page); }).toPass({ timeout: 3000 });
      await trigger.tap();
      const dialog = page.getByRole('dialog', { name: 'Koordinaten aus Google Maps' });
      await expectCompact(page, dialog);
      await dialog.getByLabel('Google-Maps-Link').fill('https://www.google.com/maps/@50,8,12z');
      await dialog.getByRole('button', { name: 'Übernehmen' }).tap();
      await expect(dialog.getByRole('alert')).toContainText('einzelnen Punkt');
      await expectCompact(page, dialog);
      await dialog.getByLabel('Google-Maps-Link').fill(POINT);
      await dialog.getByLabel('Google-Maps-Link').press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('checkbox', { name: 'Koordinaten manuell anpassen' })).toBeChecked();
      await expect(page.getByLabel('Breitengrad')).toHaveValue('50.5000636');
      await expect(page.getByLabel('Längengrad')).toHaveValue('8.4206376');
      await expect(page.getByRole('combobox', { name: 'Adresse', exact: true })).toHaveValue('');
      expect(resolverCalls).toHaveLength(0);
      await trigger.tap();
      await dialog.getByLabel('Google-Maps-Link').fill(POINT);
      // Wenig nutzbare Höhe, wie bei eingeblendeter Bildschirmtastatur.
      await page.setViewportSize({ width, height: 280 });
      await expectCompact(page, dialog);
      await dialog.getByRole('button', { name: 'Übernehmen' }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: 'Übernehmen' })).toBeInViewport();
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await expectCompact(page, dialog);
      await dialog.getByRole('button', { name: 'Abbrechen' }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeInViewport();
      await testInfo.attach(`popup-${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
      await dialog.getByRole('button', { name: 'Abbrechen' }).tap();
      await expect(dialog).toHaveCount(0);
    } finally { await context.close(); }
  });

  test(`Turnier: Import öffnet bei ${width} px über dem Bearbeitungsdialog`, async ({ browser }, testInfo) => {
    const { context, page } = await openAs(browser, ORGANIZER.session, { viewport: { width, height: 640 }, isMobile: true, hasTouch: true });
    try {
      let imports = 0;
      await page.route('**/api/locations/google-maps', (route) => {
        imports += 1;
        return route.fulfill({ json: { latitude: 50.5000636, longitude: 8.4206376 } });
      });
      await page.goto('/');
      await page.getByRole('button', { name: 'Menü öffnen' }).tap();
      await page.getByRole('button', { name: 'Turnierverwaltung', exact: true }).tap();
      await page.getByRole('button', { name: 'Neues Turnier', exact: true }).tap();
      const parent = page.getByRole('dialog', { name: 'Turnier anlegen', exact: true });
      await expect(parent).toBeVisible();
      const locationHelpButton = parent.getByRole('button', { name: 'Hilfe zu Ort, Verein und Koordinaten' });
      await expect(locationHelpButton).toHaveClass('help-btn');
      await locationHelpButton.tap();
      const locationHelp = page.getByRole('dialog', { name: 'Ort, Verein und Koordinaten' });
      await expect(locationHelp).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect(await locationHelp.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await locationHelp.getByText(/Ort auswählen → Verein prüfen → Kartenposition korrigieren/).scrollIntoViewIfNeeded();
      await expect(locationHelp.getByText(/Bei bloßer Texteingabe/)).toBeVisible();
      await locationHelp.getByRole('button', { name: 'Schließen' }).tap();
      await expect(locationHelp).toHaveCount(0);
      await expect(parent).toBeVisible();
      const trigger = parent.getByRole('button', { name: IMPORT_LABEL });
      await trigger.tap();
      const dialog = page.getByRole('dialog', { name: 'Koordinaten aus Google Maps' });
      await expectCompact(page, dialog);
      await dialog.getByLabel('Google-Maps-Link').fill('https://maps.app.goo.gl/WrGuVDaSh5nC47SK6');
      expect(imports).toBe(0);
      await testInfo.attach(`turnier-popup-${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
      await dialog.getByRole('button', { name: 'Übernehmen' }).tap();
      await expect(dialog).toHaveCount(0);
      await expect(parent).toBeVisible();
      await expect(parent.getByRole('checkbox', { name: 'Koordinaten manuell anpassen' })).toBeChecked();
      await expect(parent.getByLabel('Breitengrad')).toHaveValue('50.5000636');
      await expect(parent.getByLabel('Längengrad')).toHaveValue('8.4206376');
      await expectNoHorizontalScroll(page);
      expect(imports).toBe(1);
    } finally { await context.close(); }
  });
}
