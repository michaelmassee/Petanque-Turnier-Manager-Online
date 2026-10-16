import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PetanqueAktuellImportPanel } from './PetanqueAktuellImportPanel.jsx';

const tournaments = [
  { externalKey: 'new', name: 'Neuer Termin', date: '2026-10-01', location: 'Linden', websiteUrl: 'https://example.test/new', imported: false },
  { externalKey: 'imported', name: 'Importierter Termin', date: '2026-10-02', location: 'Gießen', websiteUrl: 'https://example.test/imported', imported: true },
];

describe('Pétanque-Aktuell-Import', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filtert künftige Termine nach ihrem Importstatus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ tournaments }), { status: 200 })));
    render(<PetanqueAktuellImportPanel />);

    await screen.findByText('Neuer Termin');
    expect(screen.getByText('Importierter Termin')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Importstatus'), { target: { value: 'imported' } });
    await waitFor(() => expect(screen.queryByText('Neuer Termin')).not.toBeInTheDocument());
    expect(screen.getByText('Importierter Termin')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Importstatus'), { target: { value: 'new' } });
    await waitFor(() => expect(screen.getByText('Neuer Termin')).toBeInTheDocument());
    expect(screen.queryByText('Importierter Termin')).not.toBeInTheDocument();
  });

  it('zeigt alle gesperrten Termine einschließlich bereits importierter ohne weitere Abfrage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tournaments: [
        ...tournaments,
        { ...tournaments[0], externalKey: 'blocked-new', name: 'Liga neu' },
        { ...tournaments[1], externalKey: 'blocked-imported', name: 'Liga importiert' },
      ],
      blacklist: ['*liga*'],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PetanqueAktuellImportPanel />);

    await screen.findByText('Liga importiert');
    fireEvent.change(screen.getByLabelText('Importstatus'), { target: { value: 'blocked' } });
    expect(screen.getByText('Liga neu')).toBeInTheDocument();
    expect(screen.queryByText('Liga importiert')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Importstatus'), { target: { value: 'all-blocked' } });
    expect(screen.getByRole('option', { name: 'Alle in der Sperrliste' }).selected).toBe(true);
    for (const name of ['Liga neu', 'Liga importiert']) {
      expect(screen.getByText(name).closest('label').querySelector('input')).toBeDisabled();
    }
    expect(screen.queryByText('Neuer Termin')).not.toBeInTheDocument();
    expect(screen.queryByText('Importierter Termin')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('importiert bereits importierte Termine erneut und behält sie bei "Alle neuen auswählen"', async () => {
    const fetchMock = vi.fn(async (url) => new Response(JSON.stringify(String(url).includes('/import') ? { created: 1, updated: 1, failed: 0 } : { tournaments }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PetanqueAktuellImportPanel />);

    const importedCheckbox = (await screen.findByText('Importierter Termin')).closest('label').querySelector('input');
    expect(importedCheckbox).not.toBeDisabled();
    fireEvent.click(importedCheckbox);
    fireEvent.click(screen.getByLabelText('Alle neuen Termine auswählen'));
    expect(importedCheckbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Ausgewählte Termine importieren' }));
    await screen.findByText(/1 neu, 1 aktualisiert/);
    const importCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/import'));
    expect(JSON.parse(importCall[1].body).externalKeys.sort()).toEqual(['imported', 'new']);
  });

  it('blendet Termine der Sperrliste aus, speichert neue Muster und importiert gesperrte Termine nicht', async () => {
    const withBlocked = [...tournaments, { externalKey: 'liga', name: 'Liga Spieltag 3', date: '2026-10-03', location: 'Mainz', websiteUrl: 'https://example.test/liga', imported: false }];
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/blacklist')) return new Response(JSON.stringify({ blacklist: JSON.parse(options.body).patterns }), { status: 200 });
      if (String(url).includes('/import')) return new Response(JSON.stringify({ created: 1, updated: 0, failed: 0 }), { status: 201 });
      return new Response(JSON.stringify({ tournaments: withBlocked, blacklist: ['*liga*'] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PetanqueAktuellImportPanel />);

    await screen.findByText('Neuer Termin');
    expect(screen.queryByText('Liga Spieltag 3')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Importstatus'), { target: { value: 'blocked' } });
    expect((await screen.findByText('Liga Spieltag 3')).closest('label').querySelector('input')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Gesperrte Turniernamen'), { target: { value: '*liga*\n/(/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sperrliste speichern' }));
    expect(await screen.findByText('Ungültige Muster: /(/')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/blacklist'))).toBe(false);

    fireEvent.change(screen.getByLabelText('Gesperrte Turniernamen'), { target: { value: '/neuer/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sperrliste speichern' }));
    await screen.findByText('Sperrliste gespeichert.');
    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/blacklist'));
    expect(JSON.parse(saveCall[1].body)).toEqual({ patterns: ['/neuer/'] });
    expect(await screen.findByText('Neuer Termin')).toBeInTheDocument();
    expect(screen.queryByText('Liga Spieltag 3')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Importstatus'), { target: { value: 'all' } });
    fireEvent.click(await screen.findByLabelText('Alle neuen Termine auswählen'));
    fireEvent.click(screen.getByRole('button', { name: 'Ausgewählte Termine importieren' }));
    await screen.findByText(/1 neu, 0 aktualisiert/);
    const importCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/import'));
    expect(JSON.parse(importCall[1].body).externalKeys).toEqual(['liga']);
  });
});
