import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { RegistrationsPanel, registrationsToCsv } from './RegistrationsManagement.jsx';

const t = (key) => key;

const TOURNAMENT = { id: 't1', name: 'Sommer Cup', currency: 'EUR', canManage: true, registrationQuestions: [] };
const REGISTRATION_WITH_FEES = {
  id: 'r1',
  firstName: 'Anna',
  lastName: 'Muster',
  status: 'confirmed',
  participation: 'inactive',
  feeSelections: [{ name: 'Mitglied', amountCents: 500 }],
  feeTotalCents: 500,
};

function renderPanel(registrations) {
  const noop = () => {};
  return render(
    <RegistrationsPanel
      tournament={TOURNAMENT}
      registrations={registrations}
      filteredRegistrations={registrations}
      tournaments={[TOURNAMENT]}
      onTournamentChange={noop}
      onCreate={noop}
      query=""
      onQueryChange={noop}
      statusFilter=""
      onStatusFilterChange={noop}
      onResetFilters={noop}
      onEdit={noop}
      onConfirm={noop}
      onConfirmAll={noop}
      onDelete={noop}
      busyId=""
    />,
  );
}

describe('registrationsToCsv', () => {
  it('exportiert Startgeld-Tarife in der Turnierwährung', () => {
    const csv = registrationsToCsv([REGISTRATION_WITH_FEES], TOURNAMENT, t);
    const [, row] = csv.trim().split('\r\n');
    expect(row).toContain('Mitglied (5,00');
    expect(row).toMatch(/5,00\s€/);
  });

  it('exportiert Anmeldungen ohne Startgeld mit leeren Geldspalten', () => {
    const csv = registrationsToCsv([{ id: 'r1', firstName: 'Anna' }], { registrationQuestions: [] }, t);
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });

  it('exportiert die Nachricht an die Turnierleitung als eigene Spalte', () => {
    const csv = registrationsToCsv([{ id: 'r1', firstName: 'Anna', organizerMessage: 'Komme später, ca. 10 Min.' }], TOURNAMENT, t);
    const [header, row] = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(header.split(',').at(-1)).toBe('organizerMessage');
    expect(row.endsWith('"Komme später, ca. 10 Min."')).toBe(true);
  });
});

describe('CSV-Export-Button', () => {
  // jsdom kennt createObjectURL/revokeObjectURL nicht - deshalb ersetzen statt spyOn
  // und nach jedem Test den Originalzustand wiederherstellen.
  const { createObjectURL, revokeObjectURL } = URL;

  afterEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.restoreAllMocks();
  });

  it('lädt beim Klick eine CSV-Datei mit den Anmeldungen inklusive Startgeld herunter', async () => {
    let exportedBlob = null;
    URL.createObjectURL = vi.fn((blob) => {
      exportedBlob = blob;
      return 'blob:meldeliste';
    });
    URL.revokeObjectURL = vi.fn();
    const clickedLinks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedLinks.push({ href: this.href, download: this.download });
    });

    renderPanel([REGISTRATION_WITH_FEES]);
    fireEvent.click(screen.getByRole('button', { name: 'CSV exportieren' }));

    expect(clickedLinks).toHaveLength(1);
    expect(clickedLinks[0].href).toBe('blob:meldeliste');
    expect(clickedLinks[0].download).toMatch(/^meldeliste-sommer-cup-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exportedBlob.type).toBe('text/csv;charset=utf-8;');
    const csv = await exportedBlob.text();
    const [header, row] = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(header).toContain('feeSelections');
    expect(row).toContain('Anna');
    expect(row).toContain('Mitglied (5,00');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:meldeliste'));
  });

  it('ist ohne Anmeldungen deaktiviert', () => {
    renderPanel([]);
    expect(screen.getByRole('button', { name: 'CSV exportieren' })).toBeDisabled();
  });
});
