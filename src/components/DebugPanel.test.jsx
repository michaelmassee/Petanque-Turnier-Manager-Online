import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../lib/i18next-config.js';
import { debugLog, isDebugEnabled, resetDebugForTest, setDebugEnabled } from '../lib/debug-log.js';
import { DebugPanel } from './DebugPanel.jsx';

const toggle = () => screen.getByRole('button', { name: /Diagnose/ });
const openPanel = () => fireEvent.click(toggle());

describe('DebugPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetDebugForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetDebugForTest();
  });

  it('ist ohne Schalter unsichtbar', () => {
    const { container } = render(<DebugPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('startet eingeklappt als schmaler Reiter ohne Liste und Buttons, damit er nichts verdeckt', () => {
    setDebugEnabled(true);
    debugLog('sw', 'Start: Controller keiner');
    render(<DebugPanel />);
    expect(screen.getByRole('region', { name: 'Diagnose' })).toHaveClass('is-collapsed');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveTextContent('(1)');
    expect(screen.queryByText(/Start: Controller keiner/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kopieren' })).not.toBeInTheDocument();
    act(() => debugLog('sw', 'controllerchange'));
    expect(toggle()).toHaveTextContent('(2)');
  });

  it('zeigt aufgeklappt Gerätedaten und Einträge, aktualisiert sich und lässt sich wieder einklappen', () => {
    setDebugEnabled(true);
    debugLog('sw', 'Start: Controller keiner');
    render(<DebugPanel />);
    openPanel();
    expect(screen.getByRole('region', { name: 'Diagnose' })).not.toHaveClass('is-collapsed');
    expect(screen.getByRole('region', { name: 'Diagnose' })).toHaveTextContent('Start: Controller keiner');
    expect(screen.getByText(/^UA: /)).toBeInTheDocument();

    const body = document.querySelector('.debug-panel-body');
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 500 });
    act(() => debugLog('sw', 'controllerchange'));
    expect(screen.getByText(/controllerchange/)).toBeInTheDocument();
    expect(body.scrollTop).toBe(500);

    openPanel();
    expect(screen.queryByText(/controllerchange/)).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('merkt sich den aufgeklappten Zustand über Neuladen im selben Tab', () => {
    setDebugEnabled(true);
    const first = render(<DebugPanel />);
    openPanel();
    first.unmount();
    render(<DebugPanel />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('funktioniert ohne Session-Speicher (startet eingeklappt)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => (key === 'ptm_debug' ? '1' : (() => { throw new Error('gesperrt'); })()));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('gesperrt'); });
    render(<DebugPanel />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    openPanel();
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('kopiert den Bericht, leert die Liste und schaltet ab', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    setDebugEnabled(true);
    debugLog('api', 'GET /api/me → 500');
    render(<DebugPanel />);
    openPanel();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopieren' })));
    expect(writeText.mock.calls[0][0]).toMatch(/\[api\] GET \/api\/me → 500/);
    expect(screen.getByRole('button', { name: 'Kopiert.' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(screen.queryByText(/GET \/api\/me/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Beenden' }));
    expect(isDebugEnabled()).toBe(false);
    expect(screen.queryByRole('region', { name: 'Diagnose' })).not.toBeInTheDocument();
  });

  it('zeigt bei verweigerter Zwischenablage den markierten Text und hält ihn auch beim Einklappen offen', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('verboten')) } });
    setDebugEnabled(true);
    debugLog('sw', 'controllerchange');
    render(<DebugPanel />);
    openPanel();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Kopieren' })));
    const textarea = screen.getByRole('textbox', { name: 'Kopieren' });
    expect(textarea).toBeVisible();
    expect(textarea.value).toMatch(/\[sw\] controllerchange/);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(textarea.value.length);

    // Einklappen lässt den Text erreichbar; „Leeren“ entfernt ihn, danach klappt der Kasten ein.
    openPanel();
    expect(screen.getByRole('textbox', { name: 'Kopieren' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Leeren' }));
    expect(screen.queryByRole('textbox', { name: 'Kopieren' })).not.toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });
});
