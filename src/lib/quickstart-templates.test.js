import { describe, expect, it } from 'vitest';
import './i18next-config.js';
import { assertTournamentSystemAllowed, normalizeTournamentInput } from '../worker-core.js';
import { isOnlinePlayable } from './pairing/index.js';
import { localIsoDate, QUICK_START_FORMATIONS, quickStartPayload, quickStartSystemLabel, quickStartTemplateLabel, quickStartTemplates, quickStartTime } from './quickstart-templates.js';

const ALL_TEMPLATES = QUICK_START_FORMATIONS.flatMap(quickStartTemplates);

const user = { firstName: 'Erste', lastName: 'Person', email: 'erste@example.org', phone: '', club: 'BC Linden', clubId: 'linden' };

describe('Schnellstart-Vorlagen', () => {
  it.each(ALL_TEMPLATES)('$id ist online spielbar und besteht die Worker-Prüfung', (template) => {
    const payload = quickStartPayload(template, { currentUser: user, today: '2026-10-28', fallbackLocation: 'Schnellstart' });
    expect(isOnlinePlayable(payload)).toBe(true);
    const tournament = normalizeTournamentInput(payload);
    expect(() => assertTournamentSystemAllowed(tournament)).not.toThrow();
    expect(tournament).toMatchObject({
      visibility: 'private', status: 'draft', registrationEnabled: true, date: '2026-10-28',
      liveViewEnabled: true, playerResultReportingEnabled: true,
    });
  });

  it('benennt das Turnier nach Vorlage und Datum und übernimmt den Profilverein als Veranstalter und Ort', () => {
    const payload = quickStartPayload(quickStartTemplates('doublette')[0], { currentUser: user, today: '2026-10-28', fallbackLocation: 'Schnellstart', language: 'de' });
    expect(payload).toMatchObject({ name: 'Supermêlée Doublette 28.10.2026', location: 'BC Linden', club: 'BC Linden', organizerClubId: 'linden', contactName: 'Erste Person', contactEmail: 'erste@example.org' });
  });

  it('setzt als Startzeit die aktuelle Uhrzeit, abgerundet auf die vergangenen 5 Minuten', () => {
    expect(quickStartTime(new Date(2026, 9, 30, 13, 47, 59))).toBe('13:45');
    expect(quickStartTime(new Date(2026, 9, 30, 9, 5, 0))).toBe('09:05');
    expect(quickStartTime(new Date(2026, 9, 30, 0, 4, 0))).toBe('00:00');
    const payload = quickStartPayload(quickStartTemplates('doublette')[0], { currentUser: user, today: '2026-10-28', startTime: '13:45', fallbackLocation: 'Schnellstart' });
    expect(normalizeTournamentInput(payload)).toMatchObject({ date: '2026-10-28', startTime: '13:45' });
  });

  it('nimmt ohne Profilverein den Platzhalter als Ort', () => {
    const payload = quickStartPayload(quickStartTemplates('doublette')[0], { currentUser: { ...user, club: '', clubId: null }, today: '2026-10-28', fallbackLocation: 'Schnellstart' });
    expect(payload).toMatchObject({ location: 'Schnellstart', club: null, organizerClubId: null });
  });

  it('bietet jedes System in jeder Formation an, Supermêlée aber nicht als Tête', () => {
    expect(quickStartTemplates('tete').map(quickStartSystemLabel)).toEqual(['Schweizer', 'Formule X', 'Jeder gegen Jeden', 'K.O.']);
    expect(quickStartTemplates('triplette').map(quickStartSystemLabel)).toEqual(['Supermêlée', 'Schweizer', 'Formule X', 'Jeder gegen Jeden', 'K.O.']);
    expect(ALL_TEMPLATES).toHaveLength(14);
    expect(new Set(ALL_TEMPLATES.map(quickStartTemplateLabel)).size).toBe(ALL_TEMPLATES.length);
    expect(new Set(ALL_TEMPLATES.map((template) => template.id)).size).toBe(ALL_TEMPLATES.length);
  });

  it('liefert das lokale Datum', () => {
    expect(localIsoDate(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
  });
});
