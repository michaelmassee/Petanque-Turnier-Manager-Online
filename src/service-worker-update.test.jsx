import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerUpdateBanner } from './components/ServiceWorkerUpdateBanner.jsx';
import { markServiceWorkerUpdateAvailable, resetServiceWorkerUpdateForTest } from './lib/service-worker-update.js';
import './lib/i18next-config.js';

describe('Hinweis bei neuem Service Worker', () => {
  afterEach(() => {
    resetServiceWorkerUpdateForTest();
    vi.restoreAllMocks();
  });

  it('zeigt erst nach einem Update einen Hinweis und lädt nur auf Klick neu', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    render(<ServiceWorkerUpdateBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => markServiceWorkerUpdateAvailable());

    expect(screen.getByRole('status')).toHaveTextContent('Neue Version verfügbar.');
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Neu laden' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
