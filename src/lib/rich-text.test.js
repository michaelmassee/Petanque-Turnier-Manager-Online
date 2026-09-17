import { describe, expect, it } from 'vitest';
import { parseRichText, serializeRichText, richTextDocument } from './rich-text.js';

describe('Rich-Text-Dokument', () => {
  it('bewahrt alte Klartexte einschließlich Zeilenumbrüchen beim Öffnen im Editor', () => {
    expect(richTextDocument('Erste Zeile\nZweite Zeile')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Erste Zeile' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Zweite Zeile' }] },
      ],
    });
    expect(parseRichText('<strong>Kein HTML</strong>')).toBeNull();
  });

  it('erkennt nur das eingeschränkte, versionierte Dokument', () => {
    const document = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wichtig', marks: [{ type: 'bold' }, { type: 'underline' }] }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt', marks: [{ type: 'strike' }] }] }, { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unterpunkt', marks: [{ type: 'italic' }] }] }] }] }] }] }] };
    expect(parseRichText(serializeRichText(document))).toEqual(document);
    expect(parseRichText('ptm-richtext:v1:{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Nicht erlaubt"}]}]}')).toBeNull();
    expect(parseRichText('ptm-richtext:v1:{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Kein Link","marks":[{"type":"link","attrs":{"href":"https://example.test"}}]}]}]}')).toBeNull();
  });

  it('speichert eine wieder geleerte Beschreibung weiterhin als leer', () => {
    expect(serializeRichText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
  });
});
