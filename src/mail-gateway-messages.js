// Feste Fehlertexte des eigenen E-Mail-Gateways. Sie werden auf Deutsch gespeichert (last_error, Postfach-Ereignis)
// und erst bei der Anzeige übersetzt: im Browser über t() und die Locales, in Push-Texten des Workers über
// MAIL_GATEWAY_ERROR_TRANSLATIONS (ein Test hält beide gleich). Fehlertexte fremder Mailserver bleiben unverändert.
export const STARTTLS_MISSING_MESSAGE = 'Der SMTP-Server bietet kein STARTTLS an – Anmeldung ohne Verschlüsselung abgelehnt. Bitte SSL/TLS (Port 465) wählen.';
export const MAIL_GATEWAY_INCOMPATIBLE_MESSAGE = 'SMTP-Bibliothek nicht kompatibel – Versand aus Sicherheitsgründen abgebrochen';
export const MAIL_GATEWAY_UNREADABLE_MESSAGE = 'Zugangsdaten nicht lesbar – bitte Passwort bzw. API-Key neu speichern';

export const MAIL_GATEWAY_ERROR_TRANSLATIONS = {
  [STARTTLS_MISSING_MESSAGE]: {
    nl: 'De SMTP-server biedt geen STARTTLS aan – aanmelden zonder versleuteling geweigerd. Kies SSL/TLS (poort 465).',
    en: 'The SMTP server does not offer STARTTLS – sign-in without encryption refused. Please choose SSL/TLS (port 465).',
    es: 'El servidor SMTP no ofrece STARTTLS: se rechazó el inicio de sesión sin cifrado. Elige SSL/TLS (puerto 465).',
    fr: 'Le serveur SMTP ne propose pas STARTTLS – connexion sans chiffrement refusée. Choisis SSL/TLS (port 465).',
    it: 'Il server SMTP non offre STARTTLS: accesso senza crittografia rifiutato. Scegli SSL/TLS (porta 465).',
  },
  [MAIL_GATEWAY_INCOMPATIBLE_MESSAGE]: {
    nl: 'SMTP-bibliotheek niet compatibel – verzending om veiligheidsredenen afgebroken',
    en: 'SMTP library not compatible – sending aborted for security reasons',
    es: 'Biblioteca SMTP no compatible: envío cancelado por motivos de seguridad',
    fr: 'Bibliothèque SMTP incompatible – envoi interrompu pour des raisons de sécurité',
    it: 'Libreria SMTP non compatibile: invio interrotto per motivi di sicurezza',
  },
  [MAIL_GATEWAY_UNREADABLE_MESSAGE]: {
    nl: 'Toegangsgegevens onleesbaar – sla het wachtwoord of de API-sleutel opnieuw op',
    en: 'Credentials unreadable – please save the password or API key again',
    es: 'Credenciales ilegibles: vuelve a guardar la contraseña o la clave API',
    fr: 'Identifiants illisibles – enregistre à nouveau le mot de passe ou la clé API',
    it: 'Credenziali illeggibili: salva di nuovo la password o la chiave API',
  },
};

// Browser: bekannte Texte über die Locales übersetzen, alles andere unverändert lassen.
export function translateMailGatewayError(t, message) {
  if (message === STARTTLS_MISSING_MESSAGE) return t(STARTTLS_MISSING_MESSAGE);
  if (message === MAIL_GATEWAY_INCOMPATIBLE_MESSAGE) return t(MAIL_GATEWAY_INCOMPATIBLE_MESSAGE);
  if (message === MAIL_GATEWAY_UNREADABLE_MESSAGE) return t(MAIL_GATEWAY_UNREADABLE_MESSAGE);
  return message;
}

// Worker (Push-Texte): gleiche Übersetzung ohne i18next.
export function mailGatewayErrorForLanguage(message, language) {
  return MAIL_GATEWAY_ERROR_TRANSLATIONS[message]?.[language] || message;
}
