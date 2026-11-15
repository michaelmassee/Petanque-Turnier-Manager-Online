// Eigenes E-Mail-Gateway einer Turnierleitung (Zusatzoption je Konto): SMTP oder Resend-API.
// Ist es aktiv, gehen die Turnier-Mails des Kontos ausschließlich darüber – kein Ausweichen auf die Plattform-Gateways.
import { HttpError } from './errors.js';
import { MAIL_GATEWAY_INCOMPATIBLE_MESSAGE, STARTTLS_MISSING_MESSAGE } from './mail-gateway-messages.js';

export { STARTTLS_MISSING_MESSAGE };

export const MAIL_GATEWAY_PROVIDERS = ['smtp', 'resend'];
export const MAIL_GATEWAY_SMTP_PORTS = [25, 465, 587, 2525];
export const MAIL_GATEWAY_SMTP_SECURITY = ['tls', 'starttls'];
// Abstand zwischen zwei Test-Mails desselben Kontos.
export const MAIL_GATEWAY_TEST_INTERVAL_MS = 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home.arpa'];

const text = (value, max = 254) => String(value ?? '').trim().slice(0, max);

function invalid(message, field) {
  return new HttpError(400, message, { field });
}

// Nur echte Hostnamen mit öffentlicher Endung, keine IP-Literale oder internen Namen.
export function isAllowedSmtpHost(host) {
  const value = String(host || '').toLowerCase();
  if (!HOSTNAME_PATTERN.test(value)) return false;
  return !BLOCKED_HOST_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

// Prüft die Eingabe aus dem Profil. secret: neuer Wert oder null (= gespeichertes Geheimnis behalten).
export function normalizeMailGatewayInput(body, { hasStoredSecret = false, storedProvider = null } = {}) {
  const provider = text(body?.provider, 20);
  if (!MAIL_GATEWAY_PROVIDERS.includes(provider)) throw invalid('Ungültiger Anbieter', 'provider');
  const fromEmail = text(body?.fromEmail);
  if (!EMAIL_PATTERN.test(fromEmail)) throw invalid('Eine gültige Absenderadresse ist erforderlich', 'fromEmail');
  const replyTo = text(body?.replyTo) || null;
  if (replyTo && !EMAIL_PATTERN.test(replyTo)) throw invalid('Eine gültige Antwortadresse ist erforderlich', 'replyTo');
  const fromName = text(body?.fromName, 100).replace(/["<>\r\n]/g, '') || null;
  const secret = String(body?.secret ?? '').trim() || null;
  // Beim Anbieterwechsel passt das gespeicherte Geheimnis nicht mehr (SMTP-Passwort ≠ API-Key).
  if (!secret && (!hasStoredSecret || storedProvider !== provider)) {
    throw invalid(provider === 'smtp' ? 'Ein Passwort ist erforderlich' : 'Ein API-Key ist erforderlich', 'secret');
  }
  if (secret && secret.length > 500) throw invalid(provider === 'smtp' ? 'Ein Passwort ist erforderlich' : 'Ein API-Key ist erforderlich', 'secret');
  const enabled = body?.enabled === undefined ? true : Boolean(body.enabled);

  if (provider === 'resend') {
    return { provider, enabled, smtpHost: null, smtpPort: null, smtpSecurity: null, smtpUser: null, fromEmail, fromName, replyTo, secret };
  }
  const smtpHost = text(body?.smtpHost, 253).toLowerCase();
  if (!isAllowedSmtpHost(smtpHost)) throw invalid('Ein gültiger SMTP-Server ist erforderlich', 'smtpHost');
  const smtpPort = Number(body?.smtpPort);
  if (!MAIL_GATEWAY_SMTP_PORTS.includes(smtpPort)) throw invalid('Ungültiger SMTP-Port', 'smtpPort');
  const smtpSecurity = text(body?.smtpSecurity, 20) || (smtpPort === 465 ? 'tls' : 'starttls');
  if (!MAIL_GATEWAY_SMTP_SECURITY.includes(smtpSecurity)) throw invalid('Ungültige Verschlüsselung', 'smtpSecurity');
  const smtpUser = text(body?.smtpUser);
  if (!smtpUser) throw invalid('Ein SMTP-Benutzer ist erforderlich', 'smtpUser');
  return { provider, enabled, smtpHost, smtpPort, smtpSecurity, smtpUser, fromEmail, fromName, replyTo, secret };
}

// Antwort an den Client – nie mit Geheimnis.
export function publicMailGateway(row, { available }) {
  if (!row) return { available, configured: false };
  return {
    available,
    configured: true,
    enabled: Boolean(Number(row.enabled)),
    provider: row.provider,
    smtpHost: row.smtp_host || '',
    smtpPort: row.smtp_port || null,
    smtpSecurity: row.smtp_security || null,
    smtpUser: row.smtp_user || '',
    fromEmail: row.from_email,
    fromName: row.from_name || '',
    replyTo: row.reply_to || '',
    hasSecret: Boolean(row.secret_enc),
    status: row.status,
    lastError: row.last_error || null,
    lastErrorAt: row.last_error_at || null,
    lastSuccessAt: row.last_success_at || null,
  };
}

function sender(gateway) {
  return gateway.fromName ? { name: gateway.fromName, email: gateway.fromEmail } : gateway.fromEmail;
}

export class MailGatewayError extends Error {}

// Kurzer, für die Turnierleitung verständlicher Fehlertext – ohne Zugangsdaten.
export function mailGatewayErrorText(error, secret) {
  let message = String(error?.message || error || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim();
  if (secret) message = message.split(secret).join('***');
  return message.slice(0, 300);
}

const MAILER_INTERNALS = ['initializeSmtpSession', 'tls', 'auth', 'start'];

// worker-mailer überspringt STARTTLS stillschweigend, wenn der Server es nicht ankündigt, und schickt AUTH dann im
// Klartext. Diese Unterklasse lässt die Anmeldung nur über eine tatsächlich verschlüsselte Verbindung zu
// (implizites TLS oder erfolgreiches STARTTLS). Sie nutzt interne Methoden der Bibliothek (Version ist fest gepinnt);
// fehlen sie, wird gar nicht erst verbunden.
export async function connectSmtpRequiringTls(WorkerMailer, options) {
  if (MAILER_INTERNALS.some((name) => typeof WorkerMailer.prototype[name] !== 'function')) {
    throw new MailGatewayError(MAIL_GATEWAY_INCOMPATIBLE_MESSAGE);
  }
  class TlsRequiredMailer extends WorkerMailer {
    async tls() {
      await super.tls();
      this.tlsEstablished = true;
    }

    async auth() {
      if (!this.secure && !this.tlsEstablished) throw new MailGatewayError(STARTTLS_MISSING_MESSAGE);
      return super.auth();
    }
  }
  const mailer = new TlsRequiredMailer(options);
  try {
    await mailer.initializeSmtpSession();
  } catch (error) {
    try { mailer.socket?.close?.(); } catch { /* Verbindung ist ohnehin unbrauchbar */ }
    throw error;
  }
  // Wie WorkerMailer.connect: die Sende-Schleife im Hintergrund starten.
  mailer.start().catch((error) => console.error('Organizer SMTP session failed', error));
  return mailer;
}

async function sendViaSmtp(gateway, { to, subject, body, html, attachments }) {
  const { WorkerMailer } = await import('worker-mailer');
  const mailer = await connectSmtpRequiringTls(WorkerMailer, {
    credentials: { username: gateway.smtpUser, password: gateway.secret },
    authType: ['plain', 'login'],
    host: gateway.smtpHost,
    port: gateway.smtpPort,
    secure: gateway.smtpSecurity === 'tls',
    startTls: gateway.smtpSecurity === 'starttls',
    socketTimeoutMs: 15000,
    responseTimeoutMs: 15000,
  });
  try {
    await mailer.send({
      from: sender(gateway),
      to,
      ...(gateway.replyTo ? { reply: gateway.replyTo } : {}),
      subject,
      text: body,
      html,
      ...(attachments ? { attachments } : {}),
    });
  } finally {
    // Ein Fehler beim Verbindungsabbau darf eine bereits angenommene Mail nicht erneut versenden.
    try { await mailer.close?.(); } catch (error) { console.error('Organizer SMTP connection close failed', error); }
  }
}

async function sendViaResendKey(gateway, { to, subject, body, html, attachments }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${gateway.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: gateway.fromName ? `${gateway.fromName} <${gateway.fromEmail}>` : gateway.fromEmail,
      to,
      ...(gateway.replyTo ? { reply_to: gateway.replyTo } : {}),
      subject,
      text: body,
      html,
      ...(attachments ? { attachments } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = detail;
    try { message = JSON.parse(detail)?.message || detail; } catch { /* Klartext */ }
    throw new MailGatewayError(`Resend ${response.status}${message ? `: ${message}` : ''}`);
  }
}

// gateway: entschlüsselte Konfiguration ({ provider, smtpHost, …, secret }).
export async function sendViaMailGateway(gateway, mail) {
  if (gateway.provider === 'resend') await sendViaResendKey(gateway, mail);
  else await sendViaSmtp(gateway, mail);
}

// Zeile aus user_mail_gateways + entschlüsseltes Geheimnis → Versandkonfiguration.
export function mailGatewayFromRow(row, secret) {
  return {
    userId: row.user_id,
    provider: row.provider,
    smtpHost: row.smtp_host,
    smtpPort: Number(row.smtp_port) || null,
    smtpSecurity: row.smtp_security,
    smtpUser: row.smtp_user,
    fromEmail: row.from_email,
    fromName: row.from_name,
    replyTo: row.reply_to,
    secret,
  };
}
