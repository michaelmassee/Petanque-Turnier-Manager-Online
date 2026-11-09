import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerUpdateBanner } from './components/ServiceWorkerUpdateBanner.jsx';
import { checkForUpdateWhenVisible, isServiceWorkerUpdateAvailable, markServiceWorkerUpdateAvailable, registerServiceWorker, resetServiceWorkerUpdateForTest } from './lib/service-worker-update.js';
import { getDebugLog, resetDebugForTest, setDebugEnabled } from './lib/debug-log.js';
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

  it('sucht beim Zurückholen der App nach einer neuen Version, im Hintergrund nicht', async () => {
    const doc = new EventTarget();
    const registration = { update: vi.fn(() => Promise.reject(new Error('offline'))) };
    checkForUpdateWhenVisible(registration, doc);

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  describe('Registrierung mit Diagnose-Protokoll', () => {
    afterEach(() => {
      localStorage.clear();
      resetDebugForTest();
    });

    function fakeWorker(state) {
      return Object.assign(new EventTarget(), { state, scriptURL: 'https://ptmonline.org/service-worker.js' });
    }

    function setup({ controller = fakeWorker('activated'), registration } = {}) {
      const container = Object.assign(new EventTarget(), { controller, startMessages: vi.fn() });
      const reg = registration || Object.assign(new EventTarget(), { active: controller, waiting: null, installing: null, update: vi.fn().mockResolvedValue() });
      container.register = vi.fn().mockResolvedValue(reg);
      const win = Object.assign(new EventTarget(), { navigator: { serviceWorker: container } });
      const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
      registerServiceWorker(win, doc);
      return { container, reg, win, doc };
    }

    const flush = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };
    const log = () => getDebugLog().map((entry) => entry.m);

    it('protokolliert Start, Registrierung, Worker-Meldungen und controllerchange; Hinweis nur mit vorherigem Controller', async () => {
      setDebugEnabled(true);
      const { container, win, reg } = setup();
      expect(container.startMessages).toHaveBeenCalled();
      win.dispatchEvent(new Event('load'));
      await flush();
      expect(container.register).toHaveBeenCalledWith('/service-worker.js');
      expect(reg.update).toHaveBeenCalledTimes(1);

      const installing = fakeWorker('installing');
      reg.installing = installing;
      reg.dispatchEvent(new Event('updatefound'));
      // Derselbe Worker taucht ein zweites Mal auf: nur einmal beobachten.
      reg.dispatchEvent(new Event('updatefound'));
      installing.state = 'activated';
      installing.dispatchEvent(new Event('statechange'));
      container.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'sw-debug', event: 'activate', cache: 'ptm-online-v10' } }));
      container.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'anderes' } }));
      container.dispatchEvent(new Event('controllerchange'));

      expect(isServiceWorkerUpdateAvailable()).toBe(true);
      expect(log()).toEqual([
        'Start: Controller activated (/service-worker.js)',
        'load → register()',
        'registriert: active activated (/service-worker.js), waiting keiner, installing keiner',
        'update() beim Start: fertig',
        'updatefound',
        'neuer Worker: installing (/service-worker.js)',
        'updatefound',
        'neuer Worker statechange: activated',
        'Worker meldet activate (ptm-online-v10)',
        'controllerchange: neu activated (/service-worker.js) → Hinweis',
      ]);
    });

    it('zeigt bei der Erstinstallation keinen Hinweis und protokolliert fehlgeschlagene Registrierung', async () => {
      setDebugEnabled(true);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { container, win } = setup({ controller: null });
      container.register = vi.fn().mockRejectedValue(new Error('blockiert'));
      container.dispatchEvent(new Event('controllerchange'));
      win.dispatchEvent(new Event('load'));
      await flush();
      expect(isServiceWorkerUpdateAvailable()).toBe(false);
      expect(log()).toContain('controllerchange: neu keiner (Erstinstallation, kein Hinweis)');
      expect(log()).toContain('Registrierung/Update fehlgeschlagen: blockiert');
    });

    it('protokolliert ohne Service-Worker-Unterstützung und ohne Schalter nichts Störendes', async () => {
      setDebugEnabled(true);
      registerServiceWorker(new EventTarget(), new EventTarget());
      expect(log()).toEqual(['Service Worker nicht unterstützt']);

      setDebugEnabled(false);
      const { win } = setup();
      win.dispatchEvent(new Event('load'));
      await flush();
      expect(getDebugLog()).toEqual([]);
    });

    it('protokolliert das Zurückholen der App und Fehler beim Update', async () => {
      setDebugEnabled(true);
      const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
      const registration = { update: vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('offline')) };
      checkForUpdateWhenVisible(registration, doc);
      doc.dispatchEvent(new Event('visibilitychange'));
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
      await flush();
      doc.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(log()).toEqual([
        'visibilitychange: hidden',
        'visibilitychange: visible',
        'update() nach Sichtbarwerden: fertig',
        'visibilitychange: visible',
        'update() nach Sichtbarwerden: Fehler offline',
      ]);
    });
  });
});

