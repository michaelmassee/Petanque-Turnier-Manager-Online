import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/i18next-config.js';
import { debugLog, isDebugEnabled, resetDebugForTest, setDebugEnabled } from '../lib/debug-log.js';
import { DebugPanel } from './DebugPanel.jsx';

describe('DebugPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDebugForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    resetDebugForTest();
  });

  it('ist ohne Schalter unsichtbar', () => {
    const { container } = render(<DebugPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt Gerätedaten und Einträge, aktualisiert sich und lässt sich einklappen', () => {
    setDebugEnabled(true);
    debugLog('sw', 'Start: Controller keiner');
    render(<DebugPanel />);
    expect(screen.getByRole('region', { name: 'Diagnose' })).toHaveTextContent('Start: Controller keiner');
    expect(screen.getByText(/^UA: /)).toBeInTheDocument();

    const body = document.querySelector('.debug-panel-body');
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 500 });
    act(() => debugLog('sw', 'controllerchange'));
    expect(screen.getByText(/controllerchange/)).toBeInTheDocument();
    expect(body.scrollTop).toBe(500);
    expect(screen.getByRole('button', { name: /Diagnose/ })).toHaveTextContent('(2)');

    fireEvent.click(screen.getByRole('button', { name: /Diagnose/ }));
    expect(screen.queryByText(/controllerchange/)).not.toBeInTheDocument();
  });

  it('kopiert den Bericht, leert die Liste und schaltet ab', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    setDebugEnabled(true);
    debugLog('api', 'GET /api/me → 500');
    render(<DebugPanel />);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopieren' })));
    expect(writeText.mock.calls[0][0]).toMatch(/\[api\] GET \/api\/me → 500/);
    expect(screen.getByRole('button', { name: 'Kopiert.' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(screen.queryByText(/GET \/api\/me/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Beenden' }));
    expect(isDebugEnabled()).toBe(false);
    expect(screen.queryByRole('region', { name: 'Diagnose' })).not.toBeInTheDocument();
  });

  it('markiert den Text zum manuellen Kopieren, wenn die Zwischenablage nicht erlaubt ist', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('verboten')) } });
    setDebugEnabled(true);
    debugLog('sw', 'Eintrag');
    render(<DebugPanel />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopieren' })));
    const textarea = screen.getByRole('textbox', { name: 'Kopieren' });
    expect(textarea).toBeVisible();
    expect(textarea.value).toMatch(/\[sw\] Eintrag/);
  });

  it('öffnet eingeklappt bei verweigerter Zwischenablage das Panel und zeigt den markierten Text', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('verboten')) } });
    setDebugEnabled(true);
    debugLog('sw', 'controllerchange');
    render(<DebugPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Diagnose/ }));
    expect(screen.queryByText(/controllerchange/)).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopieren' })));
    expect(screen.getByRole('button', { name: /Diagnose/ })).toHaveAttribute('aria-expanded', 'true');
    const textarea = screen.getByRole('textbox', { name: 'Kopieren' });
    expect(textarea).toBeVisible();
    expect(textarea.value).toMatch(/\[sw\] controllerchange/);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(textarea.value.length);

    // Bleibt beim erneuten Einklappen erreichbar; „Leeren“ entfernt ihn.
    fireEvent.click(screen.getByRole('button', { name: /Diagnose/ }));
    expect(screen.getByRole('textbox', { name: 'Kopieren' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(screen.queryByRole('textbox', { name: 'Kopieren' })).not.toBeInTheDocument();
  });
});

