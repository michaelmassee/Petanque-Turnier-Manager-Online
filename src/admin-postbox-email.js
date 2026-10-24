const TEMPLATES = {
  de: {
    subject: 'PTM Online – neue Nachricht an dich als Administrator',
    text: (name) => `${name} hat dir eine Nachricht in der PTM-Online-Postbox gesendet.\n\nBitte antworte über die Postbox in der App.`,
    open: 'PTM Online öffnen', sender: 'Benutzer',
  },
  en: {
    subject: 'PTM Online – new message to you as an administrator',
    text: (name) => `${name} sent you a message in the PTM Online inbox.\n\nPlease reply through the inbox in the app.`,
    open: 'Open PTM Online', sender: 'User',
  },
  fr: {
    subject: 'PTM Online – nouveau message pour vous en tant qu’administrateur',
    text: (name) => `${name} vous a envoyé un message dans la messagerie PTM Online.\n\nVeuillez répondre depuis la messagerie de l’application.`,
    open: 'Ouvrir PTM Online', sender: 'Utilisateur',
  },
  nl: {
    subject: 'PTM Online – nieuw bericht voor jou als beheerder',
    text: (name) => `${name} heeft je een bericht gestuurd in de PTM Online-postbus.\n\nAntwoord via de postbus in de app.`,
    open: 'PTM Online openen', sender: 'Gebruiker',
  },
  es: {
    subject: 'PTM Online – nuevo mensaje para ti como administrador',
    text: (name) => `${name} te ha enviado un mensaje en el buzón de PTM Online.\n\nResponde desde el buzón de la aplicación.`,
    open: 'Abrir PTM Online', sender: 'Usuario',
  },
};

export function buildAdminPostboxEmail(recipient, sender, body) {
  const language = TEMPLATES[recipient.language] ? recipient.language : 'de';
  const l = TEMPLATES[language];
  const name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.username || l.sender;
  return {
    to: recipient.email, subject: l.subject, text: l.text(name), messageBox: body, language,
    actions: [{ label: l.open, url: 'https://ptmonline.org/', icon: '↗' }], plainTextActions: true,
    failureContext: `admin postbox message for ${recipient.id}`,
  };
}
