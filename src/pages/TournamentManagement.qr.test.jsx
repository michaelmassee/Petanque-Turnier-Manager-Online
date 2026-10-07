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

  it('öffnet für ein privates Turnier den Code auf die Anmeldeseite mit Freigabe-Schlüssel und lädt das gespeicherte Design', async () => {
    authenticatedApi.mockImplementation(async (path) => (path.endsWith('/share-link')
      ? { shareUrl: 'https://ptm.test/turniere/privat/info?share=geheim' }
      : { design: { header: 'Gespeicherter Header' } }));
    renderList([{ ...BASIS, id: 'privat', name: 'Privates Turnier', visibility: 'private' }]);

    fireEvent.click(screen.getByRole('button', { name: 'QR-Code' }));

    expect(await screen.findByRole('dialog', { name: 'QR-Code zur Anmeldung' })).toBeInTheDocument();
    expect(screen.getByText('https://ptm.test/turniere/privat/anmelden?share=geheim')).toBeInTheDocument();
    expect(screen.getByLabelText('Header-Text')).toHaveValue('Gespeicherter Header');
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/privat/share-link', { method: 'POST' });
    expect(authenticatedApi).toHaveBeenCalledWith('/api/tournaments/privat/qr-design');
  });

  it('nutzt für öffentliche Turniere die Anmeldeseite ohne Freigabe-Link', async () => {
    authenticatedApi.mockResolvedValue({ design: null });
    renderList([{ ...BASIS, id: 'offen', name: 'Offenes Turnier' }]);

    fireEvent.click(screen.getByRole('button', { name: 'QR-Code' }));

    expect(await screen.findByText(`${window.location.origin}/turniere/offen/anmelden`)).toBeInTheDocument();
    expect(authenticatedApi).toHaveBeenCalledTimes(1);
  });

  it('zeigt keinen QR-Code für Kalendereinträge und öffentliche Entwürfe', () => {
    renderList([
      { ...BASIS, id: 'kalender', name: 'Kalendereintrag', registrationEnabled: false },
      { ...BASIS, id: 'entwurf', name: 'Entwurf', status: 'draft' },
    ]);

    expect(screen.queryByRole('button', { name: 'QR-Code' })).not.toBeInTheDocument();
  });
});
