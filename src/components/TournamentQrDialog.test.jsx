import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { drawQrImage } from '../lib/qr-style.js';
import { TournamentQrDialog } from './TournamentQrDialog.jsx';

const qrMock = vi.hoisted(() => ({ instances: [] }));

vi.mock('qr-code-styling', () => ({
  default: class {
    constructor(options) {
      this.options = options;
      qrMock.instances.push(this);
    }

    getRawData(extension) {
      return Promise.resolve(new Blob([extension === 'svg' ? '<svg width="864" height="864"></svg>' : 'png']));
    }
  },
}));

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));

// Das Logo-Bild lädt in jsdom nicht; das Einfärben wird in qr-style.test.js auf Pixelebene geprüft.
vi.mock('../lib/qr-style.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadQrLogo: (design) => Promise.resolve(design.logoInCodeColor ? `data:image/png;base64,${design.fgColor}` : '/icons/logo.png'),
    drawQrImage: vi.fn(actual.drawQrImage),
  };
});

const TOURNAMENT = { id: 't1', name: 'Herbstturnier' };
const URL_ANMELDUNG = 'https://ptm.test/turniere/t1/anmelden';
const GESPEICHERT = { fgColor: '#123456', bgColor: '#ffffff', cornerColor: '', dotType: 'rounded', cornerType: 'dot', header: 'Jetzt anmelden', footer: 'BC Muster', textSize: 'm' };

const ctx = {
  font: '', fillStyle: '', textAlign: '', textBaseline: '',
  measureText: (text) => ({ width: text.length * 10 }), fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn(),
};

function renderDialog(props = {}) {
  return render(
    <TournamentQrDialog tournament={TOURNAMENT} url={URL_ANMELDUNG} currentUserId="u1" onClose={() => {}} {...props} />,
  );
}

const letzteOptionen = () => qrMock.instances.at(-1)?.options;

describe('QR-Code zur Turnieranmeldung', () => {
  beforeEach(() => {
    qrMock.instances.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({}));
    authenticatedApi.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('erzeugt den Code für die Anmelde-URL mit hoher Fehlerkorrektur und zeigt die URL', async () => {
    renderDialog();

    await waitFor(() => expect(letzteOptionen()).toMatchObject({ data: URL_ANMELDUNG, qrOptions: { errorCorrectionLevel: 'H' }, image: '/icons/logo.png' }));
    expect(screen.getByText(URL_ANMELDUNG)).toBeInTheDocument();
    await waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());
  });

  it('belegt das gespeicherte Design vor und speichert Änderungen inkl. Header/Footer', async () => {
    authenticatedApi.mockImplementation(async (path, options) => ({ design: JSON.parse(options.body).design }));
    const onSaved = vi.fn();
    renderDialog({ initialDesign: GESPEICHERT, onSaved });

    expect(screen.getByLabelText('Header-Text')).toHaveValue('Jetzt anmelden');
    expect(screen.getByLabelText('Punkt-Style')).toHaveValue('rounded');
    expect(screen.queryByText('Nicht gespeicherte Änderungen am Design')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Footer-Text'), { target: { value: 'Boule-Club Musterstadt' } });
    expect(screen.getByText('Nicht gespeicherte Änderungen am Design')).toBeInTheDocument();
    await waitFor(() => expect(letzteOptionen().dotsOptions).toEqual({ type: 'rounded', color: '#123456' }));
    fireEvent.click(screen.getByRole('button', { name: 'Design speichern' }));

    await screen.findByText('QR-Code-Design gespeichert');
    const [pfad, optionen] = authenticatedApi.mock.calls[0];
    expect(pfad).toBe('/api/tournaments/t1/qr-design');
    expect(optionen.method).toBe('PUT');
    expect(JSON.parse(optionen.body).design).toMatchObject({ header: 'Jetzt anmelden', footer: 'Boule-Club Musterstadt' });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.queryByText('Nicht gespeicherte Änderungen am Design')).not.toBeInTheDocument();
  });

  it('zeigt einen Speicherfehler an', async () => {
    authenticatedApi.mockRejectedValue(new Error('Zugriff verweigert'));
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Design speichern' }));

    expect(await screen.findByText('Zugriff verweigert')).toBeInTheDocument();
  });

  it('warnt bei schwachem Kontrast', () => {
    renderDialog({ initialDesign: { ...GESPEICHERT, fgColor: '#dddddd' } });

    expect(screen.getByText(/Geringer Kontrast/)).toBeInTheDocument();
  });

  it('lädt PNG und SVG herunter', async () => {
    const createObjectURL = vi.fn(() => 'blob:qr');
    vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) { callback(new Blob(['png'])); });
    renderDialog({ initialDesign: GESPEICHERT });

    fireEvent.click(screen.getByRole('button', { name: 'PNG herunterladen' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'SVG herunterladen' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));

    expect(qrMock.instances.some((instance) => instance.options.type === 'svg')).toBe(true);
    const svg = await createObjectURL.mock.calls[1][0].text();
    expect(svg).toContain('>Jetzt anmelden</text>');
    expect(svg).toContain('>BC Muster</text>');
  });

  it('übernimmt das Design eines anderen eigenen Turniers, ohne es automatisch zu speichern', async () => {
    authenticatedApi.mockResolvedValue({ design: GESPEICHERT });
    renderDialog({
      sourceTournaments: [
        { id: 't1', name: 'Herbstturnier', date: '2026-10-06', canManage: true, hasQrDesign: true },
        { id: 't2', name: 'Wintercup', date: '2026-12-01', canManage: true, hasQrDesign: true },
        { id: 't3', name: 'Ohne Design', date: '2026-12-02', canManage: true, hasQrDesign: false },
      ],
    });

    fireEvent.focus(screen.getByRole('combobox', { name: 'Design von anderem Turnier importieren' }));
    const liste = screen.getByRole('listbox');
    expect(within(liste).getAllByRole('option').map((option) => option.textContent)).toEqual([expect.stringContaining('Wintercup')]);
    fireEvent.click(within(liste).getByRole('option', { name: /Wintercup/ }));

    await screen.findByText('Design übernommen – zum Behalten speichern');
    expect(authenticatedApi).toHaveBeenCalledTimes(1);
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/t2/qr-design');
    expect(screen.getByLabelText('Header-Text')).toHaveValue('Jetzt anmelden');
    expect(screen.getByLabelText('Footer-Text')).toHaveValue('BC Muster');
    expect(screen.getByText('Nicht gespeicherte Änderungen am Design')).toBeInTheDocument();
  });

  it('zeigt den Import auch ohne Quelle und erklärt, warum nichts auswählbar ist', () => {
    renderDialog({ sourceTournaments: [{ id: 't1', name: 'Herbstturnier', canManage: true, hasQrDesign: true }] });

    expect(screen.getByText('Design von anderem Turnier importieren')).toBeInTheDocument();
    expect(screen.getByText(/Noch kein anderes Turnier mit gespeichertem QR-Code-Design/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Design von anderem Turnier importieren' })).not.toBeInTheDocument();
  });

  it('schlägt Header-Texte vor und übernimmt einen Vorschlag per Klick', () => {
    renderDialog({ tournament: { id: 't1', name: 'Herbstturnier', date: '2026-10-04' } });
    const vorschlaege = screen.getByRole('group', { name: 'Vorschläge für den Header-Text' });

    fireEvent.click(within(vorschlaege).getByRole('button', { name: 'Herbstturnier · 4.10.2026' }));

    expect(screen.getByLabelText('Header-Text')).toHaveValue('Herbstturnier · 4.10.2026');
    expect(within(vorschlaege).queryByRole('button', { name: 'Herbstturnier · 4.10.2026' })).not.toBeInTheDocument();
    expect(screen.getByText('Nicht gespeicherte Änderungen am Design')).toBeInTheDocument();
  });

  it('schlägt Footer-Texte mit Verein und Turniername vor', () => {
    renderDialog({ tournament: { id: 't1', name: 'Herbstturnier', club: 'BC Musterstadt', date: '2026-10-04' } });
    const vorschlaege = screen.getByRole('group', { name: 'Vorschläge für den Footer-Text' });

    fireEvent.click(within(vorschlaege).getByRole('button', { name: 'BC Musterstadt · Herbstturnier' }));

    expect(screen.getByLabelText('Footer-Text')).toHaveValue('BC Musterstadt · Herbstturnier');
  });


  describe('Bild teilen', () => {
    const teilen = () => fireEvent.click(screen.getByRole('button', { name: 'Bild teilen' }));

    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) { callback(new Blob(['png'], { type: 'image/png' })); });
    });

    it('teilt das PNG mit Turniername und Anmeldelink über das Teilen-Menü', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
      renderDialog();

      teilen();

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const [daten] = share.mock.calls[0];
      expect(daten.files[0]).toBeInstanceOf(File);
      expect(daten.files[0].name).toBe('qr-herbstturnier.png');
      expect(daten.files[0].type).toBe('image/png');
      expect(daten.text).toBe(`Herbstturnier\n${URL_ANMELDUNG}`);
    });

    it('kopiert das Bild in die Zwischenablage, wenn Dateien nicht geteilt werden können', async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('ClipboardItem', class { constructor(items) { this.items = items; } });
      vi.stubGlobal('navigator', { ...navigator, canShare: () => false, clipboard: { write } });
      renderDialog();

      teilen();

      expect(await screen.findByText('Bild in die Zwischenablage kopiert')).toBeInTheDocument();
      expect(write.mock.calls[0][0][0].items).toHaveProperty('image/png');
    });

    it('meldet, wenn das Gerät weder Teilen noch Bild-Zwischenablage kann', async () => {
      vi.stubGlobal('navigator', { ...navigator, canShare: undefined, clipboard: undefined });
      renderDialog();

      teilen();

      expect(await screen.findByText('Teilen wird von diesem Gerät nicht unterstützt')).toBeInTheDocument();
    });

    it('zeigt keinen Fehler, wenn das Teilen abgebrochen wird', async () => {
      const share = vi.fn().mockRejectedValue(Object.assign(new Error('abgebrochen'), { name: 'AbortError' }));
      vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
      renderDialog();

      teilen();

      await waitFor(() => expect(share).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole('button', { name: 'Bild teilen' })).toBeEnabled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('meldet einen Fehler beim Teilen', async () => {
      vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: vi.fn().mockRejectedValue(new Error('kaputt')) });
      renderDialog();

      teilen();

      expect(await screen.findByText('Bild konnte nicht geteilt werden')).toBeInTheDocument();
    });
  });

  it('färbt das PTM-Logo auf Wunsch in der Code-Farbe ein und speichert die Option', async () => {
    authenticatedApi.mockImplementation(async (path, options) => ({ design: JSON.parse(options.body).design }));
    renderDialog({ initialDesign: GESPEICHERT });
    await waitFor(() => expect(letzteOptionen().image).toBe('/icons/logo.png'));

    fireEvent.click(screen.getByLabelText('PTM-Logo in Code-Farbe'));

    await waitFor(() => expect(letzteOptionen().image).toBe('data:image/png;base64,#123456'));
    expect(letzteOptionen().imageOptions.saveAsBlob).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Design speichern' }));
    await screen.findByText('QR-Code-Design gespeichert');
    expect(JSON.parse(authenticatedApi.mock.calls[0][1].body).design.logoInCodeColor).toBe(true);
  });

  describe('Export liest nie eine leere oder veraltete Vorschau', () => {
    let exportierteCanvas;
    let click;

    beforeEach(() => {
      exportierteCanvas = [];
      drawQrImage.mockClear();
      vi.stubGlobal('URL', Object.assign(globalThis.URL, { createObjectURL: vi.fn(() => 'blob:qr'), revokeObjectURL: vi.fn() }));
      click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback) {
        exportierteCanvas.push(this);
        callback(new Blob(['png'], { type: 'image/png' }));
      });
    });

    const vorschau = () => document.querySelector('.qr-preview-canvas');
    const gezeichnetFuer = (canvas) => drawQrImage.mock.calls.filter(([ziel]) => ziel === canvas).map(([, , design]) => design);

    it('rendert beim sofortigen PNG-Export nach Öffnen und Designänderung das aktuelle Design selbst', async () => {
      renderDialog({ initialDesign: GESPEICHERT });
      fireEvent.change(screen.getByLabelText('Footer-Text'), { target: { value: 'Sofort exportiert' } });

      fireEvent.click(screen.getByRole('button', { name: 'PNG herunterladen' }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

      const [canvas] = exportierteCanvas;
      expect(canvas).not.toBe(vorschau());
      expect(gezeichnetFuer(canvas)).toEqual([expect.objectContaining({ footer: 'Sofort exportiert', header: 'Jetzt anmelden' })]);
    });

    it('teilt auch beim sofortigen Klick das aktuelle Design', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
      renderDialog({ initialDesign: GESPEICHERT });
      fireEvent.change(screen.getByLabelText('Header-Text'), { target: { value: 'Neu' } });

      fireEvent.click(screen.getByRole('button', { name: 'Bild teilen' }));
      await waitFor(() => expect(share).toHaveBeenCalled());

      expect(exportierteCanvas[0]).not.toBe(vorschau());
      expect(gezeichnetFuer(exportierteCanvas[0])).toEqual([expect.objectContaining({ header: 'Neu' })]);
    });

    it('nutzt die fertige Vorschau direkt, wenn sie das aktuelle Design zeigt', async () => {
      renderDialog({ initialDesign: GESPEICHERT });
      await waitFor(() => expect(gezeichnetFuer(vorschau())).toHaveLength(1));

      fireEvent.click(screen.getByRole('button', { name: 'PNG herunterladen' }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));

      expect(exportierteCanvas).toEqual([vorschau()]);
    });
  });
});

