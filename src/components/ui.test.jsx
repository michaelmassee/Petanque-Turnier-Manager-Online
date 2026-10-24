import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import '../lib/i18next-config.js';
import { Feedback, IntegerField } from './ui.jsx';

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
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    rerender(<Feedback />);
    rerender(<Feedback error="Keine Verbindung" />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});

describe('IntegerField', () => {
  function Harness({ initial = '', ...props }) {
    const [value, setValue] = useState(initial);
    return <IntegerField label="Anzahl" value={value} onChange={setValue} {...props} />;
  }

  it('lässt nur Ziffern zu und zeigt die Zifferntastatur', () => {
    render(<Harness min={1} max={500} />);
    const input = screen.getByLabelText('Anzahl');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('maxlength', '3');
    fireEvent.change(input, { target: { value: 'e' } });
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: '-1.5e2' } });
    expect(input).toHaveValue('152');
  });

  it('prüft min und max beim Absenden wie type="number"', () => {
    render(<Harness min={1} max={20} initial={4} />);
    const input = screen.getByLabelText('Anzahl');
    expect(input).toHaveValue('4');
    expect(input.validationMessage).toBe('');
    fireEvent.change(input, { target: { value: '21' } });
    expect(input.validationMessage).toBe('Bitte eine ganze Zahl von 1 bis 20 eingeben.');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.validationMessage).toBe('');
  });

  it('kennt ein Minimum ohne Maximum und nimmt null als leer', () => {
    render(<Harness min={1} initial={null} />);
    const input = screen.getByLabelText('Anzahl');
    expect(input).toHaveValue('');
    expect(input).not.toHaveAttribute('maxlength');
    fireEvent.change(input, { target: { value: '0' } });
    expect(input.validationMessage).toBe('Bitte eine ganze Zahl ab 1 eingeben.');
  });

  it('prüft ein Maximum ohne Minimum ab 0', () => {
    render(<Harness max={5} />);
    const input = screen.getByLabelText('Anzahl');
    fireEvent.change(input, { target: { value: '9' } });
    expect(input.validationMessage).toBe('Bitte eine ganze Zahl von 0 bis 5 eingeben.');
  });
});
