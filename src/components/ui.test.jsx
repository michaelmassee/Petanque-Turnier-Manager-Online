import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { Feedback } from './ui.jsx';

describe('Feedback', () => {
  afterEach(() => {
    delete Element.prototype.scrollIntoView;
  });

  it('kündigt Fehler als Alert und Erfolg als Status an', () => {
    const { rerender } = render(<Feedback error="Keine Verbindung" />);
    expect(screen.getByRole('alert').textContent).toBe('Keine Verbindung');

    rerender(<Feedback message="Gespeichert" />);
    expect(screen.getByRole('status').textContent).toBe('Gespeichert');
  });

  it('scrollt eine neue Meldung ins Blickfeld', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const { rerender } = render(<Feedback />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<Feedback error="Keine Verbindung" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });

    rerender(<Feedback />);
    rerender(<Feedback error="Keine Verbindung" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
