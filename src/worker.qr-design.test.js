// @vitest-environment node
// Anmelde-QR-Code: Design pro Turnier speichern/laden, beim Duplizieren mitkopieren, nur für Verwalter.
import { beforeEach, describe, expect, it } from 'vitest';
import { d1MitSchema } from './test-support/d1.js';
import worker, { duplicateTournament, ensureTournamentQrToken, getTournamentById, hasTournamentShareAccess, toPublicTournament } from './worker.js';

const DESIGN = {
  fgColor: '#123456',
  bgColor: '#fafafa',
  cornerColor: '#aa0000',
  dotType: 'rounded',
  cornerType: 'extra-rounded',
  logoInCodeColor: true,
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
    expect(await antwort.json()).toMatchObject({ design: null });
  });

  it('speichert das Design und lädt es beim nächsten Öffnen wieder', async () => {
    const gespeichert = await anfrage('PUT', 's1', { design: DESIGN });
    expect(gespeichert.status).toBe(200);

    expect((await (await anfrage('GET', 's1')).json()).design).toEqual(DESIGN);
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

  describe('fester Link /q/<qr_token> für QR-Code und Teilen', () => {
    const teilen = (session = 's1') => worker.fetch(new Request('https://ptmonline.org/api/tournaments/t1/share-link', {
      method: 'POST', headers: { Cookie: `ptm_session=${session}` },
    }), env).then((r) => r.json());
    const deaktivieren = () => worker.fetch(new Request('https://ptmonline.org/api/tournaments/t1/share-link', {
      method: 'DELETE', headers: { Cookie: `ptm_session=s1` },
    }), env);
    const scannen = (link) => worker.fetch(new Request(link), env);
    const qrUrl = async () => (await (await anfrage('GET', 's1')).json()).qrUrl;

    beforeEach(() => {
      env.ASSETS = { fetch: async () => new Response('<!doctype html>app', { status: 200, headers: { 'Content-Type': 'text/html' } }) };
    });

    it('liefert immer denselben Link – beim erneuten Öffnen, beim Teilen und nach Design-Änderungen', async () => {
      const erster = await qrUrl();
      await anfrage('PUT', 's1', { design: DESIGN });

      expect(erster).toMatch(/^https:\/\/ptmonline\.org\/q\/[A-Za-z0-9_-]{22}$/);
      expect(await qrUrl()).toBe(erster);
      expect((await teilen()).shareUrl).toBe(erster);
    });

    it('bleibt gleich bei Sichtbarkeitswechsel und Deaktivieren/Reaktivieren der Freigabe', async () => {
      const link = await qrUrl();

      sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");
      expect((await teilen()).shareUrl).toBe(link);
      await deaktivieren();
      expect((await teilen()).shareUrl).toBe(link);
      sql("UPDATE tournaments SET visibility = 'public' WHERE id = 't1'");
      expect(await qrUrl()).toBe(link);
    });

    it('leitet öffentliche Turniere auf die Anmeldeseite weiter', async () => {
      const antwort = await scannen(await qrUrl());

      expect(antwort.status).toBe(302);
      expect(antwort.headers.get('Location')).toBe('https://ptmonline.org/turniere/t1/anmelden');
      expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    });

    it('folgt bei privaten Turnieren dem Freigabe-Link: aktiv → Zugriff, deaktiviert → kein Zugriff, wieder geteilt → Zugriff', async () => {
      sql("UPDATE tournaments SET visibility = 'private' WHERE id = 't1'");
      const link = (await teilen()).shareUrl;
      const ziel = async () => new URL((await scannen(link)).headers.get('Location'));

      const aktiv = await ziel();
      expect(aktiv.pathname).toBe('/turniere/t1/anmelden');
      expect(await hasTournamentShareAccess(env.DB, await getTournamentById(env.DB, 't1'), aktiv.searchParams.get('share'))).toBe(true);

      await deaktivieren();
      expect((await ziel()).searchParams.has('share')).toBe(false);

      await teilen();
      const wieder = await ziel();
      expect(await hasTournamentShareAccess(env.DB, await getTournamentById(env.DB, 't1'), wieder.searchParams.get('share'))).toBe(true);
    });

    it('fällt bei unbekanntem Schlüssel (z. B. gelöschtes Turnier) auf die App durch', async () => {
      const link = await qrUrl();
      sql("DELETE FROM tournaments WHERE id = 't1'");

      const antwort = await scannen(link);

      expect(antwort.status).toBe(200);
      expect(await antwort.text()).toContain('app');
    });

    it('gibt der Kopie beim Duplizieren einen eigenen Schlüssel', async () => {
      const link = await qrUrl();
      const kopie = await duplicateTournament(env.DB, await getTournamentById(env.DB, 't1'), { id: 'u1', role: 'user' });

      expect(kopie.qr_token).toBeNull();
      expect(`https://ptmonline.org/q/${await ensureTournamentQrToken(env.DB, kopie.id)}`).not.toBe(link);
    });

    it('verweigert Fremden das Erzeugen des Links', async () => {
      const antwort = await worker.fetch(new Request('https://ptmonline.org/api/tournaments/t1/share-link', {
        method: 'POST', headers: { Cookie: 'ptm_session=s2' },
      }), env);

      expect(antwort.status).toBe(403);
    });
  });
});

