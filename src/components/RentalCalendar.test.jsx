import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RentalCalendar } from './RentalCalendar.jsx';
import '../lib/i18next-config.js';

function week(firstDay) {
  return Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-${String(firstDay + index).padStart(2, '0')}`,
    slots: [{ hour: 10, free: 4, bookable: true }],
  }));
}

function activeTab() {
  return screen.getAllByRole('tab').find((tab) => tab.getAttribute('aria-selected') === 'true');
}

function swipe(dx, dy = 0) {
  const grid = document.querySelector('.rental-grid');
  fireEvent.touchStart(grid, { touches: [{ clientX: 200, clientY: 300 }] });
  fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
}

describe('RentalCalendar: Wischen in der Tagesansicht (Handy)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query) => ({ matches: query === '(max-width: 640px)' }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wechselt mit waagerechtem Wischen zum nächsten und vorigen Tag', () => {
    render(<RentalCalendar days={week(19)} laneCount={4} language="de" />);
    expect(activeTab()).toHaveTextContent('19');

    swipe(-80);
    expect(activeTab()).toHaveTextContent('20');

    swipe(80);
    expect(activeTab()).toHaveTextContent('19');
  });

  it('lässt senkrechtes Scrollen und kurze Bewegungen unberührt', () => {
    render(<RentalCalendar days={week(19)} laneCount={4} language="de" />);
    swipe(-60, 120);
    swipe(-30);
    expect(activeTab()).toHaveTextContent('19');
  });

  it('wechselt am Wochenrand in die nächste Woche und landet dort auf dem ersten Tag', () => {
    const onNextWeek = vi.fn();
    const { rerender } = render(<RentalCalendar days={week(19)} laneCount={4} language="de" onNextWeek={onNextWeek} />);
    fireEvent.click(screen.getAllByRole('tab').at(-1));
    swipe(-80);
    expect(onNextWeek).toHaveBeenCalledOnce();

    rerender(<RentalCalendar days={week(26)} laneCount={4} language="de" onNextWeek={onNextWeek} />);
    expect(activeTab()).toHaveTextContent('26');
  });

  it('wechselt am Wochenanfang in die vorige Woche und landet dort auf dem letzten Tag', () => {
    const onPreviousWeek = vi.fn();
    const { rerender } = render(<RentalCalendar days={week(19)} laneCount={4} language="de" onPreviousWeek={onPreviousWeek} />);
    swipe(80);
    expect(onPreviousWeek).toHaveBeenCalledOnce();

    rerender(<RentalCalendar days={week(12)} laneCount={4} language="de" onPreviousWeek={onPreviousWeek} />);
    expect(activeTab()).toHaveTextContent('18');
  });

  it('bleibt an der Buchungsgrenze stehen, wenn es keine weitere Woche gibt', () => {
    render(<RentalCalendar days={week(19)} laneCount={4} language="de" onPreviousWeek={null} />);
    swipe(80);
    expect(activeTab()).toHaveTextContent('19');
  });

  it('wischt nicht in der Wochenansicht am Desktop', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<RentalCalendar days={week(19)} laneCount={4} language="de" />);
    swipe(-80);
    expect(activeTab()).toHaveTextContent('19');
  });
});
