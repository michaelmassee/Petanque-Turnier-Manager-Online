// @vitest-environment node
// Eigenes SMTP-Gateway mit der echten worker-mailer-Bibliothek gegen einen simulierten SMTP-Server:
// Bei STARTTLS darf die Anmeldung nie unverschlüsselt erfolgen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendViaMailGateway, STARTTLS_MISSING_MESSAGE } from './mail-gateway.js';

const server = vi.hoisted(() => ({ advertiseStartTls: true, log: [] }));

// Simulierter SMTP-Server hinter cloudflare:sockets. Protokolliert jedes Kommando mit dem Verschlüsselungsstand.
vi.mock('cloudflare:sockets', () => {
  function createSocket(state) {
    let push;
    const readable = new ReadableStream({ start(controller) { push = (text) => controller.enqueue(new TextEncoder().encode(text)); } });
    let dataMode = false;
    const reply = (command) => {
      if (dataMode) {
        if (command === '.') { dataMode = false; return '250 queued'; }
        return null;
      }
      server.log.push({ command: command.startsWith('AUTH') ? 'AUTH' : command.split(' ')[0], encrypted: state.encrypted });
      if (command.startsWith('EHLO')) {
        return ['250-smtp.test', '250-AUTH PLAIN LOGIN', ...(server.advertiseStartTls && !state.encrypted ? ['250-STARTTLS'] : []), '250 SIZE 1000000'].join('\r\n');
      }
      if (command === 'STARTTLS') return '220 ready';
      if (command.startsWith('AUTH')) return '235 ok';
      if (command.startsWith('MAIL') || command.startsWith('RCPT')) return '250 ok';
      if (command === 'DATA') { dataMode = true; return '354 go'; }
      if (command === 'QUIT') return '221 bye';
      return '250 ok';
    };
    let buffer = '';
    const socket = {
      opened: Promise.resolve(),
      readable,
      writable: new WritableStream({
        write(chunk) {
          buffer += new TextDecoder().decode(chunk);
          let index;
          while ((index = buffer.indexOf('\r\n')) >= 0) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const answer = reply(line);
            if (answer) queueMicrotask(() => push(`${answer}\r\n`));
          }
        },
      }),
      startTls: () => createSocket({ encrypted: true, greeted: true }),
      close: () => {},
      closed: new Promise(() => {}),
    };
    if (!state.greeted) queueMicrotask(() => push('220 smtp.test ESMTP\r\n'));
    return socket;
  }
  return { connect: (_address, options) => createSocket({ encrypted: options.secureTransport === 'on', greeted: false }) };
});

// Der CJS-Build (main) lässt sich nicht mocken; der ESM-Build wird inline geladen (server.deps.inline in vite.config.js).
vi.mock('worker-mailer', () => import('../node_modules/worker-mailer/dist/index.mjs'));

const gateway = {
  provider: 'smtp', smtpHost: 'smtp.verein.example', smtpPort: 587, smtpSecurity: 'starttls', smtpUser: 'user', secret: 'geheim',
  fromEmail: 'turniere@verein.example', fromName: 'BC Verein', replyTo: null,
};
const mail = { to: 'anna@example.test', subject: 'Test', body: 'Hallo', html: '<p>Hallo</p>' };

describe('SMTP-Gateway mit echter Bibliothek', () => {
  beforeEach(() => {
    server.advertiseStartTls = true;
    server.log = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('meldet sich bei STARTTLS erst nach dem Hochstufen der Verbindung an', async () => {
    await sendViaMailGateway(gateway, mail);
    expect(server.log.find((entry) => entry.command === 'STARTTLS')).toEqual({ command: 'STARTTLS', encrypted: false });
    expect(server.log.find((entry) => entry.command === 'AUTH')).toEqual({ command: 'AUTH', encrypted: true });
    expect(server.log.some((entry) => entry.command === 'DATA')).toBe(true);
  });

  it('bricht ab, wenn der Server kein STARTTLS anbietet, statt das Passwort unverschlüsselt zu senden', async () => {
    server.advertiseStartTls = false;
    await expect(sendViaMailGateway(gateway, mail)).rejects.toThrow(STARTTLS_MISSING_MESSAGE);
    expect(server.log.some((entry) => entry.command === 'AUTH')).toBe(false);
    expect(server.log.some((entry) => entry.command === 'MAIL')).toBe(false);
  });

  it('meldet sich bei SSL/TLS direkt über die verschlüsselte Verbindung an', async () => {
    server.advertiseStartTls = false;
    await sendViaMailGateway({ ...gateway, smtpPort: 465, smtpSecurity: 'tls' }, mail);
    expect(server.log.find((entry) => entry.command === 'AUTH')).toEqual({ command: 'AUTH', encrypted: true });
  });
});
