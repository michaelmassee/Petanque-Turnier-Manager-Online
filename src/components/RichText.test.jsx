import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from './RichText.jsx';
import { serializeRichText } from '../lib/rich-text.js';

describe('RichText verlinkt Adressen', () => {
  it('macht http(s)-Adressen in Rich Text klickbar, ohne Satzzeichen am Ende', () => {
    const value = serializeRichText({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Infos: https://ptmonline.org/turniere/1. Danke' },
      { type: 'text', text: ' http://example.org', marks: [{ type: 'bold' }] },
    ] }] });
    render(<RichText value={value} />);

    const link = screen.getByRole('link', { name: 'https://ptmonline.org/turniere/1' });
    expect(link).toHaveAttribute('href', 'https://ptmonline.org/turniere/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.parentElement).toHaveTextContent('https://ptmonline.org/turniere/1.');
    expect(screen.getByRole('link', { name: 'http://example.org' }).closest('strong')).not.toBeNull();
  });

  it('verlinkt auch alten Klartext, aber keine anderen Schemata', () => {
    render(<RichText value={'Siehe https://example.org und javascript:alert(1) oder ptmonline.org'} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org');
  });
});
