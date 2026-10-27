// Browser-E2E-Tests (npm run test:e2e): System-Chrome gegen einen isolierten wrangler dev auf Port 8788 mit
// frisch geseedeter D1 (e2e/support/global-setup.js). Nicht Teil des quality-gate.
import { defineConfig } from '@playwright/test';
import { BASE_URL } from './e2e/support/environment.js';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  outputDir: '.wrangler/e2e/results',
  globalSetup: './e2e/support/global-setup.js',
  // Alle Szenarien teilen sich einen Server und eine D1; jede Datei nutzt eigene Turniere, läuft aber seriell.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: '.wrangler/e2e/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    headless: true,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
