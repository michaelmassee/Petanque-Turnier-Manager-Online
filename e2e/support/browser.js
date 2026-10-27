// Nutzer im Browser: jede Rolle bekommt einen eigenen Browser-Kontext (getrennte Cookies, eigener localStorage).
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { BASE_URL } from './environment.js';

const HOST = new URL(BASE_URL).hostname;

// Kontext mit fester Session aus dem Seed (session = null: anonym). confirm()-Dialoge werden bestätigt.
export async function openAs(browser, session = null, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  if (session) {
    await context.addCookies([{ name: 'ptm_session', value: session, domain: HOST, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  return { context, page };
}

// Passwort der lokalen Testkonten aus der gitignorierten .dev.vars.test-users.md (nie ausgeben).
export function testUserPassword() {
  const match = readFileSync('.dev.vars.test-users.md', 'utf8').match(/```text\s*\n([^\n]+)\n```/);
  if (!match) throw new Error('Passwort in .dev.vars.test-users.md nicht gefunden');
  return match[1].trim();
}

// API-Aufruf mit Session (oder anonym) – für Vorbereitung und Gegenproben, nicht für den getesteten Ablauf.
export async function api(request, method, path, { session = null, body } = {}) {
  const headers = { Origin: BASE_URL };
  if (session) headers.Cookie = `ptm_session=${session}`;
  const response = await request.fetch(path, { method, headers, data: body });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status(), json };
}

export async function expectOk(promise) {
  const result = await promise;
  expect(result.status, JSON.stringify(result.json)).toBeLessThan(300);
  return result.json;
}

// Kein horizontales Scrollen auf Handybreite (Standing Rule: responsive für Handy/Tablet/PC).
// Gemessen an der Gerätebreite: Auf Mobilgeräten wächst das Layout-Viewport sonst mit zu breitem Inhalt mit.
export async function expectNoHorizontalScroll(page) {
  const { width } = page.viewportSize();
  const { overflow, culprits } = await page.evaluate((deviceWidth) => ({
    overflow: document.documentElement.scrollWidth - deviceWidth,
    culprits: [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > deviceWidth + 1)
      .slice(0, 5).map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} (${Math.round(element.getBoundingClientRect().right)} px)`),
  }), width);
  expect(overflow, `${page.url()}: zu breit: ${culprits.join(', ')}`).toBeLessThanOrEqual(0);
}

// Handy-Kontext wie ein typisches Smartphone (390 × 844, Touch).
export const openMobile = (browser, session = null) => openAs(browser, session, {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
