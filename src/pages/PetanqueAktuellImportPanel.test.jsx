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
});
