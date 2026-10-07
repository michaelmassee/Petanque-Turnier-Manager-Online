import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
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

const TOURNAMENT = { id: 't1', name: 'Herbstturnier' };
const URL_ANMELDUNG = 'https://ptm.test/turniere/t1/anmelden';
const GESPEICHERT = { fgColor: '#123456', bgColor: '#ffffff', cornerColor: '', dotType: 'rounded', cornerType: 'dot', showLogo: true, header: 'Jetzt anmelden', footer: 'BC Muster', textSize: 'm' };

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

    expect(letzteOptionen().type).toBe('svg');
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

    fireEvent.focus(screen.getByRole('combobox', { name: 'Design übernehmen von …' }));
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

  it('blendet die Übernahme aus, wenn kein anderes Turnier ein Design hat', () => {
    renderDialog({ sourceTournaments: [{ id: 't1', name: 'Herbstturnier', canManage: true, hasQrDesign: true }] });

    expect(screen.queryByRole('combobox', { name: 'Design übernehmen von …' })).not.toBeInTheDocument();
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

});
