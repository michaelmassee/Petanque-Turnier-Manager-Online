import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useAutoScroll, useMediaQuery } from './hooks.js';

function Scroller({ enabled = true }) {
  const ref = useAutoScroll(enabled);
  return <div data-testid="scroller" ref={ref} />;
}

function sized(element, { scrollHeight, clientHeight }) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
}

describe('useAutoScroll', () => {
  let frames;
  let now;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.setSystemTime(0);
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Spielt Animations-Frames im 100-ms-Takt ab.
  function advance(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      now += 100;
      vi.setSystemTime(now);
      const pending = frames;
      frames = [];
      act(() => pending.forEach((callback) => callback(now)));
    }
  }

  it('scrollt erst nach der Pause oben und nur, wenn der Inhalt nicht passt', () => {
    const { getByTestId, rerender } = render(<Scroller enabled={false} />);
    const element = getByTestId('scroller');
    sized(element, { scrollHeight: 1000, clientHeight: 400 });
    rerender(<Scroller />);

    advance(3000);
    expect(element.scrollTop).toBe(0);
    advance(3000);
    expect(element.scrollTop).toBeGreaterThan(0);
  });

  it('bleibt stehen, wenn alles hineinpasst', () => {
    const { getByTestId, rerender } = render(<Scroller enabled={false} />);
    const element = getByTestId('scroller');
    sized(element, { scrollHeight: 400, clientHeight: 400 });
    rerender(<Scroller />);
    advance(10000);
    expect(element.scrollTop).toBe(0);
  });

  it('ruht nach einer Eingabe im Container', () => {
    const { getByTestId, rerender } = render(<Scroller enabled={false} />);
    const element = getByTestId('scroller');
    sized(element, { scrollHeight: 5000, clientHeight: 400 });
    rerender(<Scroller />);
    advance(6000);
    fireEvent.wheel(element);
    const position = element.scrollTop;
    advance(10000);
    expect(element.scrollTop).toBe(position);
  });

  it('springt bei „Bewegung reduzieren“ seitenweise und am Ende wieder nach oben', () => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const { getByTestId, rerender } = render(<Scroller enabled={false} />);
    const element = getByTestId('scroller');
    sized(element, { scrollHeight: 800, clientHeight: 400 });
    rerender(<Scroller />);
    act(() => vi.advanceTimersByTime(8000));
    expect(element.scrollTop).toBe(360);
    act(() => vi.advanceTimersByTime(8000));
    expect(element.scrollTop).toBe(400);
    act(() => vi.advanceTimersByTime(8000));
    expect(element.scrollTop).toBe(0);
    fireEvent.wheel(element);
    act(() => vi.advanceTimersByTime(8000));
    expect(element.scrollTop).toBe(0);
  });

  it('läuft nach der Pause unten wieder von oben', () => {
    const { getByTestId, rerender } = render(<Scroller enabled={false} />);
    const element = getByTestId('scroller');
    sized(element, { scrollHeight: 440, clientHeight: 400 });
    rerender(<Scroller />);
    advance(6000);
    expect(element.scrollTop).toBe(40);
    advance(4100);
    expect(element.scrollTop).toBe(0);
  });
});

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals());

  function Probe() {
    return <span>{useMediaQuery('(min-width: 900px)') ? 'breit' : 'schmal'}</span>;
  }

  it('folgt Änderungen der Media-Query', () => {
    const listeners = [];
    const list = { matches: false, addEventListener: (_, listener) => listeners.push(listener), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => list);
    const { getByText, unmount } = render(<Probe />);
    expect(getByText('schmal')).toBeInTheDocument();
    list.matches = true;
    act(() => listeners.forEach((listener) => listener()));
    expect(getByText('breit')).toBeInTheDocument();
    unmount();
    expect(list.removeEventListener).toHaveBeenCalled();
  });

  it('kommt ohne matchMedia aus', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(render(<Probe />).getByText('schmal')).toBeInTheDocument();
  });
});
