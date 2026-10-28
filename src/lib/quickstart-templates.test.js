import { describe, expect, it } from 'vitest';
import './i18next-config.js';
import { assertTournamentSystemAllowed, normalizeTournamentInput } from '../worker-core.js';
import { isOnlinePlayable } from './pairing/index.js';
import { localIsoDate, QUICK_START_FORMATIONS, quickStartPayload, quickStartSystemLabel, quickStartTemplateLabel, quickStartTemplates } from './quickstart-templates.js';

const ALL_TEMPLATES = QUICK_START_FORMATIONS.flatMap(quickStartTemplates);

const user = { firstName: 'Erste', lastName: 'Person', email: 'erste@example.org', phone: '', club: 'BC Linden' };

describe('Schnellstart-Vorlagen', () => {
  it.each(ALL_TEMPLATES)('$id ist online spielbar und besteht die Worker-Prüfung', (template) => {
    const payload = quickStartPayload(template, { currentUser: user, today: '2026-10-28', fallbackLocation: 'Schnellstart' });
    expect(isOnlinePlayable(payload)).toBe(true);
    const tournament = normalizeTournamentInput(payload);
    expect(() => assertTournamentSystemAllowed(tournament)).not.toThrow();
    expect(tournament).toMatchObject({ visibility: 'private', status: 'draft', registrationEnabled: true, date: '2026-10-28' });
  });

  it('benennt das Turnier nach Vorlage und Datum und nimmt den Profilverein als Ort', () => {
    const payload = quickStartPayload(quickStartTemplates('doublette')[0], { currentUser: user, today: '2026-10-28', fallbackLocation: 'Schnellstart' });
    expect(payload).toMatchObject({ name: 'Supermêlée Doublette 2026-10-28', location: 'BC Linden', contactName: 'Erste Person', contactEmail: 'erste@example.org' });
  });

  it('nimmt ohne Profilverein den Platzhalter als Ort', () => {
    const payload = quickStartPayload(quickStartTemplates('doublette')[0], { currentUser: { ...user, club: '' }, today: '2026-10-28', fallbackLocation: 'Schnellstart' });
    expect(payload.location).toBe('Schnellstart');
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
