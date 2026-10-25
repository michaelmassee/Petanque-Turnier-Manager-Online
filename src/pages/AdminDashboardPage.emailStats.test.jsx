import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as api from '../lib/api.js';
import i18next from '../lib/i18next-config.js';
import { EmailStatsPanel } from './AdminDashboardPage.jsx';

function stats(range = 30) {
  const days = Array.from({ length: range }, (_, index) => ({
    day: new Date(Date.parse('2026-10-25T00:00:00Z') - (range - index - 1) * 86400000).toISOString().slice(0, 10),
    strato: 1, resend: 2, total: 3,
  }));
  return {
    range, trackingSince: '2025-10-01T10:00:00Z', days,
    totals: {
      today: { strato: 1, resend: 2, total: 3 }, week: { strato: 7, resend: 14, total: 21 },
      range: { strato: range, resend: range * 2, total: range * 3 }, allTime: { strato: 500, resend: 1000, total: 1500 },
    },
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await i18next.changeLanguage('de');
});

describe('Admin: E-Mail-Statistik', () => {
  it('zeigt Summen, Verlauf, Anbieter und Tabelle im vorhandenen Statistikstil', async () => {
    const request = vi.spyOn(api, 'authenticatedApi').mockImplementation(async (path) => stats(Number(path.split('days=')[1])));
    const { container } = render(<EmailStatsPanel />);
    expect(await screen.findByText('Erfassung seit 1.10.2025. Frühere Versanddaten sind nicht verfügbar.')).toBeInTheDocument();
    const totals = container.querySelectorAll('.visitor-total');
    expect(totals).toHaveLength(4);
    expect(totals[0]).toHaveTextContent('Heute3Strato: 1 · Resend: 2');
    expect(totals[1]).toHaveTextContent('Diese Woche (ab Montag, UTC)21');
    expect(totals[2]).toHaveTextContent('Letzte 30 Tage90');
    expect(totals[3]).toHaveTextContent('Gesamt1.500');
    expect(screen.getByRole('img', { name: 'Versendete E-Mails: Summe' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(31);
    fireEvent.click(screen.getByRole('button', { name: 'Strato' }));
    expect(screen.getByRole('img', { name: 'Versendete E-Mails: Strato' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelectorAll('.visitor-chart-hit')[0]);
    expect(container.querySelector('.visitor-readout')).toHaveTextContent('26.9.2026 E-Mails: 3');
    fireEvent.click(screen.getByRole('button', { name: '7 Tage' }));
    await waitFor(() => expect(container.querySelectorAll('.visitor-chart-hit')).toHaveLength(7));
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith('/api/admin/email-stats?days=7');
  });

  it('fasst den Jahresverlauf in Wochen zusammen, einschließlich des ersten verbleibenden Tages', async () => {
    vi.spyOn(api, 'authenticatedApi').mockImplementation(async (path) => stats(Number(path.split('days=')[1])));
    const { container } = render(<EmailStatsPanel />);
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '365 Tage' }));
    await waitFor(() => expect(container.querySelectorAll('.visitor-chart-hit')).toHaveLength(53));
    fireEvent.click(container.querySelectorAll('.visitor-chart-hit')[0]);
    expect(container.querySelector('.visitor-readout')).toHaveTextContent('26.10.2025 E-Mails: 3');
    const tableRows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    const total = tableRows.reduce((sum, row) => sum + Number(within(row).getAllByRole('cell')[3].textContent), 0);
    expect(total).toBe(1095);
  });

  it('zeigt Ladefehler und ignoriert verspätete Antworten eines vorherigen Zeitraums', async () => {
    let resolveOld;
    vi.spyOn(api, 'authenticatedApi')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(stats(7))
      .mockRejectedValueOnce(new Error('Statistik nicht verfügbar'));
    const { container } = render(<EmailStatsPanel />);
    expect(screen.getByText('Lädt …')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7 Tage' }));
    await screen.findByRole('img');
    await act(async () => resolveOld(stats(30)));
    await waitFor(() => expect(container.querySelectorAll('.visitor-chart-hit')).toHaveLength(7));
    fireEvent.click(screen.getByRole('button', { name: '90 Tage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Statistik nicht verfügbar');
    expect(container.querySelector('.visitor-totals')).toHaveTextContent('Letzte 7 Tage');
  });

  it.each([
    ['en', 'Sent emails', 'This week (from Monday, UTC)'],
    ['nl', 'Verzonden e-mails', 'Deze week (vanaf maandag, UTC)'],
    ['fr', 'E-mails envoyés', 'Cette semaine (depuis lundi, UTC)'],
    ['es', 'Correos enviados', 'Esta semana (desde el lunes, UTC)'],
  ])('übersetzt die neue Statistik vollständig (%s)', async (language, title, week) => {
    vi.spyOn(api, 'authenticatedApi').mockResolvedValue(stats());
    await i18next.changeLanguage(language);
    render(<EmailStatsPanel />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(await screen.findByText(week)).toBeInTheDocument();
    expect(screen.queryByText(/Frühere Versanddaten sind nicht verfügbar/)).not.toBeInTheDocument();
  });
});
