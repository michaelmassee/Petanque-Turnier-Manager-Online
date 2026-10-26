import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportMapBounds } from './TileFallbackMap.jsx';

const map = vi.hoisted(() => {
  const listeners = new Set();
  return {
    listeners,
    bounds: 'initial',
    on: vi.fn((type, fn) => { if (type === 'moveend') listeners.add(fn); }),
    off: vi.fn((type, fn) => { if (type === 'moveend') listeners.delete(fn); }),
    whenReady: vi.fn((fn) => fn()),
    getBounds: vi.fn(() => map.bounds),
    fireMoveend: () => listeners.forEach((fn) => fn()),
  };
});

vi.mock('react-leaflet', () => ({
  useMap: () => map,
}));

describe('ReportMapBounds', () => {
  it('meldet den Ausschnitt sofort und nach jedem moveend', () => {
    const onChange = vi.fn();
    render(<ReportMapBounds onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith('initial');

    map.bounds = 'moved';
    map.fireMoveend();
    expect(onChange).toHaveBeenLastCalledWith('moved');
  });

  it('meldet den moveend-Listener beim erneuten Rendern nicht ab', () => {
    // Ein Ab-/Anmelden pro Render ließe ein synchrones moveend aus FitToBounds verloren gehen.
    map.on.mockClear();
    map.off.mockClear();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<ReportMapBounds onChange={first} />);
    rerender(<ReportMapBounds onChange={second} />);

    expect(map.on).toHaveBeenCalledOnce();
    expect(map.off).not.toHaveBeenCalled();
    map.bounds = 'refit';
    map.fireMoveend();
    expect(second).toHaveBeenLastCalledWith('refit');
  });
});
