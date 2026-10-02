import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { RegistrationsManagementPage, RegistrationsPanel, registrationsToCsv } from './RegistrationsManagement.jsx';

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

describe('Anmeldungsverwaltung: Turnierauswahl', () => {
  it('blendet Kalendereinträge aus und wählt stattdessen ein Turnier mit Anmeldeverfahren', async () => {
    const setSelectedTournamentId = vi.fn();
    render(
      <RegistrationsManagementPage
        tournaments={[
          { id: 'calendar', name: 'Kalendereintrag', canManage: true, registrationEnabled: false },
          { id: 'registration', name: 'Sommer Cup', canManage: true, registrationEnabled: true },
        ]}
        selectedTournamentId="calendar"
        setSelectedTournamentId={setSelectedTournamentId}
        language="de"
      />,
    );

    const tournamentSelect = screen.getByLabelText('Turnier anzeigen');
    expect(tournamentSelect).not.toHaveTextContent('Kalendereintrag');
    expect(tournamentSelect).toHaveTextContent('Sommer Cup');
    await waitFor(() => expect(setSelectedTournamentId).toHaveBeenCalledWith('registration'));
  });
});

describe('Anmeldungsverwaltung: Anmeldedetails', () => {
  it('zeigt Nachricht, Tarife und positive Teilnehmerantworten erst nach dem Aufklappen', () => {
    const tournament = {
      ...TOURNAMENT,
      registrationQuestions: [{ id: 'meal', label: 'Vegetarisches Essen?' }],
    };
    const registration = {
      ...REGISTRATION_WITH_FEES,
      feeSelections: [{ tariffId: 'member', name: 'Mitglied', amountCents: 500 }],
      organizerMessage: 'Bitte ohne Mittagessen einplanen.',
      registrationAnswers: [{ participant: 'primary', questionId: 'meal', checked: true }],
    };
    const noop = () => {};

    render(
      <RegistrationsPanel
        tournament={tournament}
        registrations={[registration]}
        filteredRegistrations={[registration]}
        tournaments={[tournament]}
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

    const details = screen.getByText('Anmeldedetails anzeigen').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByLabelText('Nachricht an Turnierleitung')).toBeInTheDocument();
    expect(screen.getByLabelText('Frage beantwortet')).toHaveTextContent('Vegetarisches Essen?');
    expect(screen.getByLabelText('Tarif ausgewählt')).toHaveTextContent('Mitglied');

    fireEvent.click(screen.getByText('Anmeldedetails anzeigen'));

    expect(details).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Nachricht an die Turnierleitung' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gewählte Tarife' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teilnehmerfragen' })).toBeInTheDocument();
    expect(screen.getByText('Bitte ohne Mittagessen einplanen.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teilnehmerfragen' }).parentElement).toHaveTextContent(/Vegetarisches Essen\?: Hauptspieler/);
  });

  it('zeigt keinen Details-Schalter ohne Zusatzangaben', () => {
    renderPanel([{ id: 'r2', firstName: 'Ben', lastName: 'Gast', status: 'confirmed' }]);

    expect(screen.queryByText('Anmeldedetails anzeigen')).not.toBeInTheDocument();
  });
});

describe('Anmeldungsverwaltung: Konto-Verknüpfungen', () => {
  it('kennzeichnet nur die verbundenen Teammitglieder', () => {
    renderPanel([{
      id: 'r-account', firstName: 'Anna', lastName: 'Muster', status: 'confirmed', accountConnected: true,
      partnerFirstName: 'Ben', partnerLastName: 'Gast', partnerAccountConnected: false,
      partner2FirstName: 'Clara', partner2LastName: 'Konto', partner2AccountConnected: true,
    }]);

    expect(screen.getAllByLabelText('Mit Benutzerkonto verbunden')).toHaveLength(2);
    expect(screen.getByText('Partner: Ben Gast')).toBeInTheDocument();
    expect(screen.getByText('Partner 2: Clara Konto')).toBeInTheDocument();
  });
});
