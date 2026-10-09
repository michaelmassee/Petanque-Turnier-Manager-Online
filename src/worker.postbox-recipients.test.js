// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createBroadcastPostboxMessage, listPostboxRecipients, postboxMessageBody, postboxSummary, renderTransactionalEmailHtml } from './worker.js';
import { d1MitSchema } from './test-support/d1.js';

function seed(sqlite) {
  sqlite.exec(`INSERT INTO users (id, email, first_name, last_name, role, password_salt, password_hash, created_at, updated_at) VALUES
      ('organizer-1', 'orga@example.test', 'Olga', 'Orga', 'user', 's', 'h', '2026-01-01', '2026-01-01'),
      ('recipient-1', 'ada@example.test', 'Ada', 'Beispiel', 'user', 's', 'h', '2026-01-01', '2026-01-01');
    INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at) VALUES
      ('tournament-1', 'organizer-1', 'Herbstturnier', '2026-10-06', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01'),
      ('tournament-2', 'organizer-1', 'Leeres Turnier', '2026-11-01', 'Ort', 'doublette', 'registration', 'public', '2026-01-01', '2026-01-01');
    UPDATE tournaments SET registration_enabled = 1;`);
  const anmeldung = (id, status) => sqlite.prepare(`INSERT INTO registrations (id, tournament_id, first_name, last_name, email,
      status, registered_at, created_at, updated_at)
    VALUES (?, 'tournament-1', 'Anna', 'Adler', ?, ?, '2026-01-01', '2026-01-01', '2026-01-01')`).run(id, `${id}@example.test`, status);
  anmeldung('offen', 'pending');
  anmeldung('bestaetigt', 'confirmed');
  anmeldung('warteliste', 'waitlist');
  anmeldung('storniert', 'cancelled');
}

describe('Postbox-Empfänger für Turnier-Broadcasts', () => {
  it('liefert Turnierdatum und zählt offene, bestätigte und Wartelisten-Meldungen, auch null', async () => {
    const db = d1MitSchema();
    seed(db.sqlite);

    const response = await listPostboxRecipients(db, 'organizer-1');

    await expect(response.json()).resolves.toEqual({
      recipients: [{ id: 'recipient-1', firstName: 'Ada', lastName: 'Beispiel', username: null, club: null, role: 'user' }],
      tournaments: [
        { id: 'tournament-1', name: 'Herbstturnier', date: '2026-10-06', registrationCount: 3 },
        { id: 'tournament-2', name: 'Leeres Turnier', date: '2026-11-01', registrationCount: 0 },
      ],
    });
  });
});

describe('Postbox-Zusammenfassung fürs Polling', () => {
  it('liefert nur Ungelesen-Zahl und Todos, keine Nachrichten', async () => {
    const db = d1MitSchema();
    seed(db.sqlite);
    db.sqlite.exec(`INSERT INTO postbox_messages (id, sender_id, recipient_id, kind, body, created_at) VALUES
      ('m1', 'recipient-1', 'organizer-1', 'direct', 'Hallo', '2026-01-02'),
      ('m2', 'recipient-1', 'organizer-1', 'direct', 'Gelesen', '2026-01-03');
      UPDATE postbox_messages SET read_at = '2026-01-04' WHERE id = 'm2';`);

    await expect(postboxSummary(db, { id: 'organizer-1', role: 'user' })).resolves.toEqual({
      unreadCount: 1,
      todos: [{ type: 'pending_registrations', count: 1 }, { type: 'waitlist', count: 1 }],
    });
  });
});

describe('Versand eines Turnier-Broadcasts', () => {
  it('erreicht offene, bestätigte und Wartelisten-Meldungen per E-Mail und Push, stornierte nicht', async () => {
    const db = d1MitSchema();
    seed(db.sqlite);
    db.sqlite.exec(`UPDATE users SET mail_enabled = 1 WHERE id = 'organizer-1';
      UPDATE registrations SET user_id = 'recipient-1' WHERE id = 'warteliste';`);
    const send = vi.fn(async () => {});
    const sender = { id: 'organizer-1', email: 'orga@example.test', firstName: 'Olga', lastName: 'Orga' };

    await createBroadcastPostboxMessage({ DB: db, MAIL_QUEUE: { send } }, { sender, tournament: { id: 'tournament-1', owner_id: 'organizer-1', name: 'Herbstturnier' }, body: 'Start 10 Uhr' });

    const mails = send.mock.calls.map(([payload]) => payload).filter((payload) => payload.to);
    expect(mails.map((mail) => mail.to).sort()).toEqual(['bestaetigt@example.test', 'offen@example.test', 'warteliste@example.test']);
    expect(mails[0]).toMatchObject({ messageBox: 'Start 10 Uhr' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'push', userId: 'recipient-1' }));
  });
});

describe('Postbox-Nachrichtentext', () => {
  const rich = (text) => `ptm-richtext:v1:${JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] })}`;

  it('nimmt Klartext und Rich Text bis 500 sichtbare Zeichen an', () => {
    expect(postboxMessageBody('  Hallo  ')).toBe('Hallo');
    expect(postboxMessageBody('x'.repeat(500))).toHaveLength(500);
    // Das JSON ist deutlich länger als 500 Zeichen, gezählt wird nur der Text.
    expect(postboxMessageBody(rich('x'.repeat(500)))).toBe(rich('x'.repeat(500)));
  });

  it('lehnt leere, zu lange oder ungültige Nachrichten ab', () => {
    expect(() => postboxMessageBody('   ')).toThrow('zwischen 1 und 500 Zeichen');
    expect(() => postboxMessageBody('x'.repeat(501))).toThrow('zwischen 1 und 500 Zeichen');
    expect(() => postboxMessageBody(rich('x'.repeat(501)))).toThrow('zwischen 1 und 500 Zeichen');
    expect(() => postboxMessageBody('ptm-richtext:v1:{"type":"doc","content":[{"type":"script"}]}')).toThrow('Ungültige Nachricht');
  });
});

describe('Postbox-Nachricht in der E-Mail', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Startzeit' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Neu: ' }, { type: 'text', text: '10 Uhr', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'strike' }] }] },
    { type: 'paragraph' },
    { type: 'orderedList', attrs: { start: 2, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>x</script> https://ptmonline.org' }] }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt' }] }] }] },
  ] };

  it('rendert Rich Text formatiert und escaped in einer eigenen Box nach dem Einleitungstext', () => {
    const html = renderTransactionalEmailHtml('Betreff', 'Hallo Anna,\n\nOlga schreibt:', 'de', `ptm-richtext:v1:${JSON.stringify(doc)}`);
    const box = html.slice(html.indexOf('border-left:4px solid #087f6f'));
    expect(html.indexOf('Olga schreibt:')).toBeLessThan(html.indexOf('border-left:4px solid #087f6f'));
    expect(box).toContain('font-weight:700;">Startzeit</p>');
    expect(box).toContain('Neu: <s><u><em><strong>10 Uhr</strong></em></u></s>');
    expect(box).toContain('&nbsp;');
    expect(box).toContain('<ol start="2"');
    expect(box).toContain('<ul style=');
    expect(box).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(box).not.toContain('<script>');
    expect(box).toContain('<a href="https://ptmonline.org"');
  });

  it('zeigt alte Klartext-Nachrichten mit Zeilenumbrüchen in der Box und lässt Mails ohne Nachricht unverändert', () => {
    expect(renderTransactionalEmailHtml('Betreff', 'Hallo', 'de', 'Zeile 1\nZeile <2>')).toContain('Zeile 1<br>Zeile &lt;2&gt;</p></div>');
    expect(renderTransactionalEmailHtml('Betreff', 'Hallo', 'de')).not.toContain('border-left:4px solid #087f6f');
  });

  it('verlinkt Adressen in der E-Mail ohne Satzzeichen am Ende', () => {
    const html = renderTransactionalEmailHtml('Betreff', 'Hallo', 'de', 'Siehe https://ptmonline.org/turniere/1. Oder (https://example.org)!');
    expect(html).toContain('<a href="https://ptmonline.org/turniere/1" style="color:#086f61;text-decoration:underline;word-break:break-all;">https://ptmonline.org/turniere/1</a>. Oder');
    expect(html).toContain('>https://example.org</a>)!');
  });
});
