// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { paymentInfoEmailBlock } from './worker.js';

describe('Zahlungshinweise am Turnier', () => {
  let env;
  const ZAHLUNG = 'IBAN DE02 1203 0000 0000 2020 51\nVerwendungszweck: Teamname';

  function anfrage(path, method = 'GET', body) {
    return worker.fetch(new Request(`https://ptm.test${path}`, {
      method, headers: { 'Content-Type': 'application/json', Cookie: 'ptm_session=owner-session' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env);
  }

  const praesentation = (paymentInfo) => anfrage('/api/tournaments/t1/presentation', 'PUT',
    { websiteUrl: '', logoUrl: '', flyerUrl: '', whatsappGroupUrl: '', ...(paymentInfo === undefined ? {} : { paymentInfo }) });
  const gespeichert = () => env.DB.sqlite.prepare("SELECT payment_info FROM tournaments WHERE id = 't1'").get().payment_info;

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: vi.fn() } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, mail_enabled, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 1, 'salt', 'hash', '2026-09-01', '2026-09-01');
      INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('owner-session', 'owner', '2099-01-01T00:00:00.000Z', '2026-09-01');
      INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Turnier', '2099-09-28', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01');`);
  });

  it('speichert die Hinweise mit Zeilenumbrüchen und zeigt sie öffentlich', async () => {
    expect((await praesentation(`  ${ZAHLUNG.replace('\n', '\r\n')}  `)).status).toBe(200);
    expect(gespeichert()).toBe(ZAHLUNG);

    const oeffentlich = await worker.fetch(new Request('https://ptm.test/api/tournaments/t1'), env);
    expect((await oeffentlich.json()).tournament.paymentInfo).toBe(ZAHLUNG);
  });

  it('behält die Hinweise, wenn ein älterer Client das Feld nicht mitschickt, und leert sie bei leerem Text', async () => {
    await praesentation(ZAHLUNG);
    await praesentation(undefined);
    expect(gespeichert()).toBe(ZAHLUNG);

    await praesentation('   ');
    expect(gespeichert()).toBeNull();
  });

  it('lehnt mehr als 1000 Zeichen ab', async () => {
    const antwort = await praesentation('x'.repeat(1001));
    expect(antwort.status).toBe(400);
    expect(gespeichert()).toBeNull();
  });

  it('setzt den Block in der Sprache des Empfängers in die Mail, ohne Hinweise gar nicht', () => {
    expect(paymentInfoEmailBlock({ payment_info: 'Bizum 600 000 000' }, 'es')).toBe('\n\nIndicaciones de pago de la organización:\nBizum 600 000 000');
    expect(paymentInfoEmailBlock({ payment_info: null }, 'de')).toBe('');
  });

  it('schickt die Hinweise mit der Anmeldebestätigung', async () => {
    env.DB.sqlite.prepare("UPDATE tournaments SET payment_info = ? WHERE id = 't1'").run(ZAHLUNG);
    await worker.fetch(new Request('https://ptm.test/api/tournaments/t1/registrations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Neu', lastName: 'Team', playerEmail: 'neu@example.test', publicationNoticeAccepted: true,
        personsConsentAccepted: true, feeSelections: [], registrationAnswers: [] }),
    }), env);

    const mail = env.MAIL_QUEUE.send.mock.calls.map(([message]) => message).find((message) => message.to === 'neu@example.test');
    expect(JSON.stringify(mail)).toContain('Zahlungshinweise der Turnierleitung');
    expect(JSON.stringify(mail)).toContain('IBAN DE02 1203 0000 0000 2020 51');
  });
});
