import { describe, expect, it } from 'vitest';
import { parseTournamentDescription, serializeTournamentDescription, tournamentDescriptionDocument } from './tournament-description.js';

describe('Turnierbeschreibung', () => {
  it('bewahrt alte Klartexte einschließlich Zeilenumbrüchen beim Öffnen im Editor', () => {
    expect(tournamentDescriptionDocument('Erste Zeile\nZweite Zeile')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Erste Zeile' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Zweite Zeile' }] },
      ],
    });
    expect(parseTournamentDescription('<strong>Kein HTML</strong>')).toBeNull();
  });

  it('erkennt nur das eingeschränkte, versionierte Dokument', () => {
    const document = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wichtig', marks: [{ type: 'bold' }, { type: 'underline' }] }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt', marks: [{ type: 'strike' }] }] }, { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unterpunkt', marks: [{ type: 'italic' }] }] }] }] }] }] }] };
    expect(parseTournamentDescription(serializeTournamentDescription(document))).toEqual(document);
    expect(parseTournamentDescription('ptm-richtext:v1:{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Nicht erlaubt"}]}]}')).toBeNull();
    expect(parseTournamentDescription('ptm-richtext:v1:{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Kein Link","marks":[{"type":"link","attrs":{"href":"https://example.test"}}]}]}]}')).toBeNull();
  });

  it('speichert eine wieder geleerte Beschreibung weiterhin als leer', () => {
    expect(serializeTournamentDescription({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
  });
});
