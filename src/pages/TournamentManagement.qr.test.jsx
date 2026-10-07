import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { TournamentList } from './TournamentManagement.jsx';

vi.mock('qr-code-styling', () => ({
  default: class {
    getRawData() {
      return Promise.resolve(new Blob(['png']));
    }
  },
}));

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));

// Das Logo-Bild lädt in jsdom nicht; das Einfärben wird in qr-style.test.js auf Pixelebene geprüft.
vi.mock('../lib/qr-style.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadQrLogo: (design) => Promise.resolve(design.logoInCodeColor ? `data:image/png;base64,${design.fgColor}` : '/icons/logo.png'),
}));

const BASIS = {
  location: 'Musterstadt', date: '2099-06-01', formation: 'doublette', registrationType: 'forme', type: 'ko', status: 'registration',
  visibility: 'public', activeRegistrations: 0, maxRegistrations: 16, waitlistRegistrations: 0, canManage: true,
};

function renderList(tournaments) {
  render(
    <TournamentList
      tournaments={tournaments}
      totalTournaments={tournaments.length}
      selectedId=""
      onSelect={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      isAdmin={false}
      language="de"
      onCreate={() => {}}
      query=""
      onQueryChange={() => {}}
      statusFilter=""
      onStatusFilterChange={() => {}}
      onResetFilters={() => {}}
    />,
  );
}

describe('Turnierverwaltung: QR-Code zur Anmeldung', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    authenticatedApi.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it('nutzt bei privaten Turnieren den festen Link, aktiviert dabei die Freigabe und lädt das gespeicherte Design', async () => {
    authenticatedApi.mockImplementation(async (path) => (path.endsWith('/share-link')
      ? { shareUrl: 'https://ptmonline.org/q/fester-link-privat-01' }
      : { design: { header: 'Gespeicherter Header' }, qrUrl: 'https://ptmonline.org/q/fester-link-privat-01' }));
    renderList([{ ...BASIS, id: 'privat', name: 'Privates Turnier', visibility: 'private' }]);

    fireEvent.click(screen.getByRole('button', { name: 'QR-Code' }));

    expect(await screen.findByRole('dialog', { name: 'QR-Code zur Anmeldung' })).toBeInTheDocument();
    expect(screen.getByText('https://ptmonline.org/q/fester-link-privat-01')).toBeInTheDocument();
    expect(screen.getByLabelText('Header-Text')).toHaveValue('Gespeicherter Header');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/privat/share-link', { method: 'POST' });
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/privat/qr-design');
  });

  it('nutzt bei öffentlichen Turnieren den festen Link ohne Freigabe-Aufruf', async () => {
    authenticatedApi.mockResolvedValue({ design: null, qrUrl: 'https://ptmonline.org/q/fester-link-offen-01' });
    renderList([{ ...BASIS, id: 'offen', name: 'Offenes Turnier' }]);

    fireEvent.click(screen.getByRole('button', { name: 'QR-Code' }));

    expect(await screen.findByText('https://ptmonline.org/q/fester-link-offen-01')).toBeInTheDocument();
    expect(authenticatedApi).toHaveBeenCalledTimes(1);
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/offen/qr-design');
  });

  it('teilt beim Turnier-Teilen denselben festen Link wie im QR-Code', async () => {
    const writeText = vi.fn().mockResolvedValue();
    const share = navigator.share;
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    authenticatedApi.mockResolvedValue({ shareUrl: 'https://ptmonline.org/q/fester-link-offen-01' });
    try {
      renderList([{ ...BASIS, id: 'offen', name: 'Offenes Turnier' }]);

      fireEvent.click(screen.getByRole('button', { name: 'Turnier teilen' }));

      expect(await screen.findByText('Link kopiert')).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith('https://ptmonline.org/q/fester-link-offen-01');
    } finally {
      Object.defineProperty(navigator, 'share', { configurable: true, value: share });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    }
  });

  it('zeigt keinen QR-Code für Kalendereinträge und öffentliche Entwürfe', () => {
    renderList([
      { ...BASIS, id: 'kalender', name: 'Kalendereintrag', registrationEnabled: false },
      { ...BASIS, id: 'entwurf', name: 'Entwurf', status: 'draft' },
    ]);

    expect(screen.queryByRole('button', { name: 'QR-Code' })).not.toBeInTheDocument();
  });
});
