import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from '../locales/de.json';
import nl from '../locales/nl.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';

// Übergangsphase: TRANSLATIONS/translateDom in lib/i18n.js bleiben aktiv, bis alle
// Komponenten auf useTranslation()/t() umgestellt sind. Beide Systeme laufen parallel
// auf derselben Sprache (siehe App.jsx: language-State ruft i18next.changeLanguage()).
i18next.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    nl: { translation: nl },
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
  },
  lng: localStorage.getItem('ptm_language') || 'de',
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  // Keys sind ganze deutsche Sätze (siehe Migrationsentscheidung: deutscher Text bleibt Key)
  // und enthalten oft ":" oder ".". i18next würde das sonst als Namespace- bzw.
  // Pfad-Trenner interpretieren und Lookups falsch auflösen.
  keySeparator: false,
  nsSeparator: false,
});

export default i18next;
