import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { subsetsForText } from './flyer-fonts.js';
import { createFlyerTypesetter, richTextNode, textNode } from './flyer-text.js';
import { serializeRichText } from './rich-text.js';

const require = createRequire(import.meta.url);
const loaded = [];
const typeset = createFlyerTypesetter(async (subset, weight, style) => {
  loaded.push(`${subset}-${weight}-${style}`);
  return readFileSync(require.resolve(`@fontsource/noto-sans/files/noto-sans-${subset}-${weight}-${style}.woff`));
}, () => import('satori').then((module) => module.default));
const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const paragraph = (...content) => ({ type: 'paragraph', content });
const item = (...content) => ({ type: 'listItem', content: [paragraph(...content)] });

describe('flyer text (satori)', () => {
  it('maps characters to the Noto Sans subsets from the Fontsource CSS', () => {
    expect(subsetsForText('Abc')).toEqual(['latin']);
    expect(subsetsForText('Łódź Москва Ελλάδα')).toEqual(['latin', 'latin-ext', 'greek', 'cyrillic']);
  });

  it('sets text as vector paths and reports the real height of wrapped text', async () => {
    const short = await typeset(textNode('Herbstturnier', { size: 5 }), 100);
    const long = await typeset(textNode('Herbstturnier '.repeat(12), { size: 5 }), 100);
    expect(short.markup).toContain('<path');
    expect(short.markup).not.toContain('<text');
    expect(long.height).toBeGreaterThan(short.height * 3);
  });

  it('loads further subsets only for characters that need them', async () => {
    await typeset(textNode('Turnier in Łódź', { size: 5 }), 100);
    expect(loaded).toContain('latin-ext-400-normal');
    expect(loaded).not.toContain('cyrillic-400-normal');
  });

  it('keeps rich text formatting, headings and lists', async () => {
    const value = serializeRichText({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [text('Programm')] },
      paragraph(text('Kaffee ', 'bold'), text('und', 'italic'), text(' Kuchen', 'underline'), text(' gratis', 'strike')),
      { type: 'orderedList', attrs: { start: 3 }, content: [item(text('Drei')), item(text('Vier'))] },
    ] });
    const node = richTextNode(value, { size: 4, color: '#111111' });
    const serialized = JSON.stringify(node);
    expect(serialized).toContain('"fontWeight":700');
    expect(serialized).toContain('"fontStyle":"italic"');
    expect(serialized).toContain('"textDecoration":"underline"');
    expect(serialized).toContain('"textDecoration":"line-through"');
    expect(serialized).toContain('"3."');
    expect(serialized).toContain('"4."');
    const block = await typeset(node, 80);
    expect(block.height).toBeGreaterThan(20);
    expect(loaded).toContain('latin-400-italic');
  });

  it('keeps old plain text with paragraphs', () => {
    const serialized = JSON.stringify(richTextNode('Zeile eins\n\nZeile zwei', { size: 4 }));
    expect(serialized).toContain('Zeile eins');
    expect(serialized).toContain(' ');
    expect(serialized).toContain('Zeile zwei');
  });
});
