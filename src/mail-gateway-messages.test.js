// Feste Gateway-Fehlertexte: Locales (Browser) und Worker-Tabelle (Push) müssen dieselbe Übersetzung liefern.
import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it_ from './locales/it.json';
import nl from './locales/nl.json';
import {
  MAIL_GATEWAY_ERROR_TRANSLATIONS, mailGatewayErrorForLanguage, STARTTLS_MISSING_MESSAGE, translateMailGatewayError,
} from './mail-gateway-messages.js';

const locales = { de, en, es, fr, it: it_, nl };

describe('Feste Fehlertexte des eigenen E-Mail-Gateways', () => {
  it('stimmen in Locales und Worker-Tabelle überein', () => {
    for (const [message, translations] of Object.entries(MAIL_GATEWAY_ERROR_TRANSLATIONS)) {
      expect(locales.de[message]).toBe(message);
      for (const language of ['nl', 'en', 'es', 'fr', 'it']) {
        expect(locales[language][message], `${language}: ${message}`).toBe(translations[language]);
      }
    }
  });

  it('übersetzt bekannte Texte und lässt fremde Serverantworten unverändert', async () => {
    const instance = i18next.createInstance();
    await instance.init({ lng: 'en', resources: { en: { translation: en } }, keySeparator: false, nsSeparator: false });
    expect(translateMailGatewayError(instance.t, STARTTLS_MISSING_MESSAGE)).toBe(en[STARTTLS_MISSING_MESSAGE]);
    expect(translateMailGatewayError(instance.t, '535 Authentication failed')).toBe('535 Authentication failed');
    expect(mailGatewayErrorForLanguage(STARTTLS_MISSING_MESSAGE, 'fr')).toMatch(/^Le serveur SMTP/);
    expect(mailGatewayErrorForLanguage(STARTTLS_MISSING_MESSAGE, 'de')).toBe(STARTTLS_MISSING_MESSAGE);
  });
});
