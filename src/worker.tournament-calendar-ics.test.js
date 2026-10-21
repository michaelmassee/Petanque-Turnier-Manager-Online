// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { tournamentIcsFileNameHeader, tournamentIcsFileNames } from './worker.js';

describe('Kalendereintrag zum Turnier (calendar.ics)', () => {
  let env;
  const abrufen = (query = '', id = 't1') => worker.fetch(new Request(`https://ptm.test/api/tournaments/${id}/calendar.ics${query}`), env);

  beforeEach(() => {
    env = { DB: d1MitSchema(), MAIL_QUEUE: { send: () => {} } };
    env.DB.sqlite.exec(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('owner', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01');
      INSERT INTO tournaments (id, owner_id, name, date, start_time, timezone, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'owner', 'Herbstturnier', '2099-11-14', '10:00', 'Europe/Lisbon', 'Ort', 'tete', 'registration', 'public', '2026-09-01', '2026-09-01'),
             ('privat', 'owner', 'Privat', '2099-11-14', '10:00', 'Europe/Berlin', 'Ort', 'tete', 'registration', 'private', '2026-09-01', '2026-09-01');`);
  });

  it('liefert den Termin inline in der Ortszeit des Turniers', async () => {
    const antwort = await abrufen();
    const text = await antwort.text();

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(antwort.headers.get('Content-Disposition'))
      .toBe(`inline; filename="Herbstturnier 2099-11-14.ics"; filename*=UTF-8''Herbstturnier%202099-11-14.ics`);
    expect(text).toContain('SUMMARY:Herbstturnier');
    expect(text).toContain('DTSTART;TZID=Europe/Lisbon:20991114T100000');
    expect(text).toContain('DTEND;TZID=Europe/Lisbon:20991114T140000');
  });

  it('bietet die Datei mit download=1 als Download an', async () => {
    expect((await abrufen('?download=1')).headers.get('Content-Disposition')).toMatch(/^attachment; filename="Herbstturnier 2099-11-14\.ics"/);
  });

  it.each([
    ['Tournoi d’été à Nîmes', 'Tournoi d_ete a Nimes 2099-11-01.ics'],
    ['Турнир Москва', '2099-11-01.ics'],
    ['Τουρνουά', '2099-11-01.ics'],
  ])('benennt %s international korrekt', (name, ascii) => {
    expect(tournamentIcsFileNames({ name, date: '2099-11-01' })).toEqual({ fileName: `${name} 2099-11-01.ics`, asciiFileName: ascii });
  });

  it('benennt die Datei nach dem Turnier, mit Umlauten und ASCII-Ersatz', () => {
    expect(tournamentIcsFileNameHeader({ name: 'Maultaschen/Turnier: Größe "Ü"', date: '2099-11-01' }))
      .toBe(`filename="Maultaschen Turnier Groesse Ue 2099-11-01.ics"; filename*=UTF-8''${encodeURIComponent('Maultaschen Turnier Größe Ü 2099-11-01.ics')}`);
  });

  it('gibt private Turniere ohne Freigabe nicht heraus', async () => {
    expect((await abrufen('', 'privat')).status).toBe(403);
    expect((await abrufen('', 'unbekannt')).status).toBe(404);
  });
});
