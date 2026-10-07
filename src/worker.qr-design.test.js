// @vitest-environment node
// Anmelde-QR-Code: Design pro Turnier speichern/laden, beim Duplizieren mitkopieren, nur für Verwalter.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { duplicateTournament, getTournamentById, toPublicTournament } from './worker.js';

const DESIGN = {
  fgColor: '#123456',
  bgColor: '#fafafa',
  cornerColor: '#aa0000',
  dotType: 'rounded',
  cornerType: 'extra-rounded',
  showLogo: false,
  header: 'Jetzt anmelden!',
  footer: 'Boule-Club Musterstadt',
  textSize: 'l',
};

describe('QR-Code-Design pro Turnier', () => {
  let env;
  const sql = (statement, ...params) => env.DB.sqlite.prepare(statement).run(...params);

  const anfrage = (method, session, body, id = 't1') => worker.fetch(new Request(`https://ptm.test/api/tournaments/${id}/qr-design`, {
    method,
    headers: { Cookie: `ptm_session=${session}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);

  beforeEach(() => {
    env = { DB: d1MitSchema() };
    sql(`INSERT INTO users (id, email, role, password_salt, password_hash, created_at, updated_at)
      VALUES ('u1', 'leitung@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01'),
             ('u2', 'fremd@example.test', 'user', 'salt', 'hash', '2026-09-01', '2026-09-01')`);
    sql(`INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES ('s1', 'u1', '2099-01-01T00:00:00.000Z', '2026-09-01'), ('s2', 'u2', '2099-01-01T00:00:00.000Z', '2026-09-01')`);
    sql(`INSERT INTO tournaments (id, owner_id, name, date, location, formation, status, visibility, created_at, updated_at)
      VALUES ('t1', 'u1', 'Turnier', '2099-10-04', 'Ort', 'triplette', 'registration', 'public', '2026-09-01', '2026-09-01')`);
  });

  it('liefert ohne gespeichertes Design null', async () => {
    const antwort = await anfrage('GET', 's1');

    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ design: null });
  });

  it('speichert das Design und lädt es beim nächsten Öffnen wieder', async () => {
    const gespeichert = await anfrage('PUT', 's1', { design: DESIGN });
    expect(gespeichert.status).toBe(200);

    expect(await (await anfrage('GET', 's1')).json()).toEqual({ design: DESIGN });
    // Reine Darstellung: keine Turnier-Änderung, die eine Synchronisation auslöst.
    expect(env.DB.sqlite.prepare("SELECT updated_at FROM tournaments WHERE id = 't1'").get().updated_at).toBe('2026-09-01');
  });

  it('bereinigt ungültige Werte und verwirft unbekannte Schlüssel', async () => {
    await anfrage('PUT', 's1', { design: { fgColor: 'red', dotType: 'stern', header: `a\u0000b${'x'.repeat(200)}`, evil: '<script>' } });

    const { design } = await (await anfrage('GET', 's1')).json();
    expect(design.fgColor).toBe('#000000');
    expect(design.dotType).toBe('square');
    expect(design.header).toHaveLength(120);
    expect(design.header.startsWith('a b')).toBe(true);
    expect(design).not.toHaveProperty('evil');
  });

  it('lehnt fehlendes oder zu großes Design ab', async () => {
    expect((await anfrage('PUT', 's1', {})).status).toBe(400);
    expect((await anfrage('PUT', 's1', { design: { header: 'x'.repeat(5000) } })).status).toBe(400);
  });

  it('verweigert fremden und anonymen Nutzern Lesen und Speichern', async () => {
    expect((await anfrage('GET', 's2')).status).toBe(403);
    expect((await anfrage('PUT', 's2', { design: DESIGN })).status).toBe(403);
    expect((await anfrage('GET', 'unbekannt')).status).toBe(401);
  });

  it('kopiert das Design beim Duplizieren vollständig mit', async () => {
    await anfrage('PUT', 's1', { design: DESIGN });
    const original = await getTournamentById(env.DB, 't1');

    const kopie = await duplicateTournament(env.DB, original, { id: 'u1', role: 'user' });

    expect(JSON.parse(kopie.qr_design)).toEqual(DESIGN);
  });

  it('dupliziert ein Turnier ohne Design ohne Design', async () => {
    const kopie = await duplicateTournament(env.DB, await getTournamentById(env.DB, 't1'), { id: 'u1', role: 'user' });

    expect(kopie.qr_design).toBeNull();
  });

  it('verrät hasQrDesign nur Verwaltern', async () => {
    await anfrage('PUT', 's1', { design: DESIGN });
    const zeile = await getTournamentById(env.DB, 't1');

    expect(toPublicTournament(zeile, { id: 'u1', role: 'user' }).hasQrDesign).toBe(true);
    expect(toPublicTournament(zeile, { id: 'u2', role: 'user' }).hasQrDesign).toBeUndefined();
    expect(toPublicTournament(zeile, null).hasQrDesign).toBeUndefined();
    expect(toPublicTournament(zeile, null)).not.toHaveProperty('qrDesign');
  });
});
