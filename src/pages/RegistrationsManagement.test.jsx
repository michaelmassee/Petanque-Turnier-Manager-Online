import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { RegistrationForm, RegistrationsManagementPage, RegistrationsPanel, registrationsToCsv } from './RegistrationsManagement.jsx';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';

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

function renderPanel(registrations, props = {}) {
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
      {...props}
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

  it('kann bestätigte Meldungen als reine Namensliste exportieren', () => {
    const csv = registrationsToCsv([
      { firstName: 'Anna', lastName: 'Muster', partnerFirstName: 'Ben', partnerLastName: 'Beispiel', status: 'confirmed' },
      { firstName: 'Carla', lastName: 'Gast', status: 'pending' },
    ], TOURNAMENT, t, { namesOnly: true, confirmedOnly: true });

    expect(csv.replace(/^﻿/, '').trim().split('\r\n')).toEqual(['firstName,lastName,partnerFirstName,partnerLastName', 'Anna,Muster,Ben,Beispiel']);
  });

  it('schreibt jede Meldung in eine Zeile, auch Triplettes und Einzelmeldungen gemischt', () => {
    const csv = registrationsToCsv([
      { firstName: 'Anna', lastName: 'Muster', partnerFirstName: 'Ben', partnerLastName: 'Beispiel', partner2FirstName: 'Cleo', partner2LastName: 'Drei' },
      { firstName: 'Dora', lastName: 'Solo' },
    ], TOURNAMENT, t, { namesOnly: true });

    expect(csv.replace(/^﻿/, '').trim().split('\r\n')).toEqual([
      'firstName,lastName,partnerFirstName,partnerLastName,partner2FirstName,partner2LastName',
      'Anna,Muster,Ben,Beispiel,Cleo,Drei',
      'Dora,Solo,,,,',
    ]);
  });

  it('exportiert nur Namen ohne Partner zweispaltig', () => {
    const csv = registrationsToCsv([{ firstName: 'Anna', lastName: 'Muster' }], TOURNAMENT, t, { namesOnly: true });
    expect(csv.replace(/^﻿/, '').trim().split('\r\n')).toEqual(['firstName,lastName', 'Anna,Muster']);
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
    expect(clickedLinks).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'CSV herunterladen' }));

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

  it('kombiniert beide CSV-Optionen beim Download', async () => {
    let exportedBlob = null;
    URL.createObjectURL = vi.fn((blob) => { exportedBlob = blob; return 'blob:meldeliste'; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderPanel([{ ...REGISTRATION_WITH_FEES, partnerFirstName: 'Ben', partnerLastName: 'Beispiel' }]);
    fireEvent.click(screen.getByRole('button', { name: 'CSV exportieren' }));
    fireEvent.click(screen.getByLabelText('Nur Namen'));
    fireEvent.click(screen.getByLabelText('Nur bestätigte Meldungen'));
    fireEvent.click(screen.getByRole('button', { name: 'CSV herunterladen' }));

    expect((await exportedBlob.text()).replace(/^﻿/, '').trim().split('\r\n')).toEqual(['firstName,lastName,partnerFirstName,partnerLastName', 'Anna,Muster,Ben,Beispiel']);
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

    fireEvent.focus(screen.getByRole('combobox', { name: 'Turnier anzeigen' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options.join(' ')).not.toContain('Kalendereintrag');
    expect(options.join(' ')).toContain('Sommer Cup');
    await waitFor(() => expect(setSelectedTournamentId).toHaveBeenCalledWith('registration'));
  });
});

describe('Anmeldungsverwaltung: Dialog „Anmeldung erfassen“', () => {
  it('wählt das Turnier über die Turnier-Combobox mit Datum und Meldungen', () => {
    const setForm = vi.fn();
    const form = { ...EMPTY_REGISTRATION_FORM, tournamentId: 'a' };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RegistrationForm
          form={form}
          setForm={setForm}
          onSubmit={(event) => event.preventDefault()}
          tournaments={[
            { id: 'a', name: 'Sommer Cup', date: '2026-07-01', formation: 'tete', registrationType: 'forme', canManage: true, activeRegistrations: 4 },
            { id: 'b', name: 'Herbst Cup', date: '2026-10-03', formation: 'tete', registrationType: 'forme', canManage: true, activeRegistrations: 1, waitlistRegistrations: 1 },
          ]}
          selectedTournamentId="a"
          currentUserId="user-1"
          manageMode
        />
      </QueryClientProvider>,
    );

    const input = screen.getByRole('combobox', { name: 'Turnier' });
    expect(input).toHaveValue('Sommer Cup · 1.7.2026');
    fireEvent.focus(input);
    const option = screen.getByRole('option', { name: /Herbst Cup/ });
    expect(option).toHaveTextContent('3.10.2026 · 2 Anmeldungen');
    fireEvent.click(option);
    expect(setForm).toHaveBeenCalledWith({ ...form, tournamentId: 'b' });
    localStorage.clear();
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
      id: 'r-account', firstName: 'Anna', lastName: 'Muster', status: 'confirmed', accountConnected: true, club: 'BC Linden', licenseNr: 'A-1',
      partnerFirstName: 'Ben', partnerLastName: 'Gast', partnerAccountConnected: false, partnerClub: 'BC Gießen', partnerLicenseNr: 'B-2',
      partner2FirstName: 'Clara', partner2LastName: 'Konto', partner2AccountConnected: true, partner2Club: 'BC Frankfurt', partner2LicenseNr: 'C-3',
    }]);

    expect(screen.getAllByLabelText('Mit Benutzerkonto verbunden')).toHaveLength(2);
    expect(screen.getByText('Partner: Ben Gast')).toBeInTheDocument();
    expect(screen.getByText('Partner 2: Clara Konto')).toBeInTheDocument();
    expect(screen.getByText('Partner: Ben Gast').tagName).toBe('SPAN');
    expect(screen.getByText('Partner 2: Clara Konto').tagName).toBe('SPAN');
    expect(screen.getByText('BC Linden')).toBeInTheDocument();
    expect(screen.getByText('BC Gießen')).toBeInTheDocument();
    expect(screen.getByText('BC Frankfurt')).toBeInTheDocument();
    expect(screen.getByText('Lizenznummer: A-1')).toBeInTheDocument();
    expect(screen.getByText('Lizenznummer: B-2')).toBeInTheDocument();
    expect(screen.getByText('Lizenznummer: C-3')).toBeInTheDocument();
  });
});

describe('Anmeldungsverwaltung: Live-Link neu senden', () => {
  afterEach(() => vi.restoreAllMocks());

  it('schickt unabhängig vom alten Live-Flag einen neuen Link und meldet den Versand', async () => {
    const registration = { id: 'r1', tournamentId: 't1', firstName: 'Anna', lastName: 'Muster', playerEmail: 'anna@example.test',
      status: 'confirmed', participation: 'inactive', feeSelections: [], registrationAnswers: [] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      const body = String(url).endsWith('/live-link') && options.method === 'POST' ? { sent: 1 } : { registrations: [registration] };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    render(
      <RegistrationsManagementPage
        tournaments={[{ id: 't1', name: 'Sommer Cup', canManage: true, registrationEnabled: true }]}
        selectedTournamentId="t1"
        setSelectedTournamentId={() => {}}
        language="de"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Live-Link neu senden' }));

    expect(await screen.findAllByText('Ein neuer Live-Link wurde an die Spieler geschickt.')).not.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/registrations/r1/live-link', expect.objectContaining({ method: 'POST' }));
  });
});

describe('Anmeldungsverwaltung: Nachricht an Team', () => {
  afterEach(() => vi.restoreAllMocks());

  it('öffnet pro Anmeldung einen Nachrichtendialog mit Empfängern und Richtext-Editor', async () => {
    const registration = { id: 'r1', tournamentId: 't1', firstName: 'Anna', lastName: 'Muster', partnerFirstName: 'Paul', partnerLastName: 'Partner',
      status: 'confirmed', participation: 'inactive', feeSelections: [], registrationAnswers: [] };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ registrations: [registration] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(
      <RegistrationsManagementPage
        tournaments={[{ id: 't1', name: 'Sommer Cup', canManage: true, registrationEnabled: true }]}
        selectedTournamentId="t1"
        setSelectedTournamentId={() => {}}
        language="de"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Nachricht an Team' }));

    expect(screen.getByRole('heading', { name: 'Nachricht an Team' })).toBeInTheDocument();
    expect(screen.getByText('Anna Muster, Paul Partner')).toBeInTheDocument();
    expect(screen.getByText(/Der Link zum Turnier wird mitgeschickt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fett' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();
  });
});

describe('Anmeldungsverwaltung: Ablehnen', () => {
  it('bietet Ablehnen auch in der normalen Liste nur für offene Anmeldungen an', () => {
    const onReject = vi.fn();
    const pending = { id: 'r-pending', firstName: 'Otto', lastName: 'Offen', status: 'pending' };
    renderPanel([pending, { id: 'r-confirmed', firstName: 'Bea', lastName: 'Bestätigt', status: 'confirmed' }], { onReject });

    const buttons = screen.getAllByRole('button', { name: 'Ablehnen' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onReject).toHaveBeenCalledWith(pending);
  });
});

describe('Anmeldungsverwaltung: Freigabe und Storno durch die Turnierleitung', () => {
  function response(payload) {
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  function managedRegistration(id, status = 'pending') {
    return { id, tournamentId: 't1', firstName: `Spieler ${id}`, lastName: 'Test', email: `${id}@example.test`, status, participation: 'inactive', feeSelections: [], registrationAnswers: [] };
  }

  function renderManagement(initialRegistrations) {
    let registrations = initialRegistrations.map((registration) => ({ ...registration }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      const path = String(url);
      if (path === '/api/tournaments/t1/registrations') return response({ registrations });
      if (path === '/api/tournaments/t1/registrations/confirm-pending') {
        const pending = registrations.filter((registration) => registration.status === 'pending');
        registrations = registrations.map((registration) => registration.status === 'pending' ? { ...registration, status: 'confirmed' } : registration);
        return response({ confirmedCount: pending.length });
      }
      if (path.endsWith('/reject')) {
        const id = path.split('/')[3];
        registrations = registrations.filter((registration) => registration.id !== id);
        return response({ ok: true });
      }
      if (options.method === 'PUT') {
        const id = path.split('/').at(-1);
        registrations = registrations.map((registration) => registration.id === id ? { ...registration, status: 'confirmed' } : registration);
        return response({ ok: true });
      }
      if (options.method === 'DELETE') {
        const id = path.split('/').at(-1);
        registrations = registrations.filter((registration) => registration.id !== id);
        return response({ ok: true });
      }
      throw new Error(`Unerwartete Anfrage: ${path}`);
    });
    render(
      <RegistrationsManagementPage
        tournaments={[{ ...TOURNAMENT, registrationEnabled: true }]}
        selectedTournamentId="t1"
        setSelectedTournamentId={() => {}}
        language="de"
      />,
    );
    return fetchMock;
  }

  afterEach(() => vi.restoreAllMocks());

  it('bestätigt eine offene Anmeldung einzeln und lädt die Liste danach neu', async () => {
    const fetchMock = renderManagement([managedRegistration('pending-1')]);

    fireEvent.click(await screen.findByRole('button', { name: 'Bestätigen' }));

    expect(await screen.findByText('Anmeldung wurde bestätigt.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/registrations/pending-1', expect.objectContaining({ method: 'PUT' }));
    expect(screen.queryByRole('button', { name: 'Bestätigen' })).not.toBeInTheDocument();
  });

  it('bestätigt alle offenen Anmeldungen, ohne bereits bestätigte zu verändern', async () => {
    const fetchMock = renderManagement([managedRegistration('pending-1'), managedRegistration('pending-2'), managedRegistration('confirmed-1', 'confirmed')]);

    fireEvent.click(await screen.findByRole('button', { name: 'Alle bestätigen' }));

    expect(await screen.findByText('2 offene Anmeldung(en) wurden bestätigt.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/t1/registrations/confirm-pending', expect.objectContaining({ method: 'POST' }));
  });

  it('lehnt eine offene Anmeldung mit optionalem Grund ab', async () => {
    const fetchMock = renderManagement([managedRegistration('pending-1')]);

    fireEvent.click(await screen.findByRole('button', { name: 'Ablehnen' }));
    fireEvent.change(screen.getByLabelText(/^Ablehnungsgrund/), { target: { value: 'Startfeld voll' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.querySelector('.button-danger'));

    expect(await screen.findByText('Anmeldung wurde abgelehnt.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/registrations/pending-1/reject', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Startfeld voll' }) }));
  });

  it.each(['Turnierleiter', 'Bearbeiter'])('storniert eine Anmeldung als %s erst nach Bestätigung', async () => {
    const fetchMock = renderManagement([managedRegistration('confirmed-1', 'confirmed')]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Löschen' }));

    expect(await screen.findByText('Anmeldung wurde gelöscht.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/registrations/confirmed-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('behält die Anmeldung, wenn die Turnierleitung das Storno abbricht', async () => {
    const fetchMock = renderManagement([managedRegistration('confirmed-1', 'confirmed')]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Löschen' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/registrations/confirmed-1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText(/Spieler confirmed-1/)).toBeInTheDocument();
  });
});


describe('Anmeldungsverwaltung: VIP-Schalter', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup({ isVip = false, status = 'confirmed', fail = false, approvalInboxActive = false } = {}) {
    let registration = {
      id: 'vip-1', tournamentId: 't1', firstName: 'Anna', lastName: 'Muster',
      email: 'anna@example.test', playerEmail: 'anna@example.test', club: 'BC Linden',
      status, isVip, seedingPosition: 3, feeSelections: [], registrationAnswers: [],
    };
    const onTournamentsChanged = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      if (options.method === 'PUT') {
        if (fail) return new Response(JSON.stringify({ error: 'Speichern fehlgeschlagen' }), { status: 500 });
        registration = { ...registration, ...JSON.parse(options.body) };
        return new Response(JSON.stringify({ registration }), { status: 200 });
      }
      return new Response(JSON.stringify({ registrations: [registration] }), { status: 200 });
    });
    render(
      <RegistrationsManagementPage
        tournaments={[{ ...TOURNAMENT, registrationEnabled: true }]}
        selectedTournamentId="t1"
        setSelectedTournamentId={() => {}}
        onTournamentsChanged={onTournamentsChanged}
        language="de"
        approvalInboxActive={approvalInboxActive}
      />,
    );
    return { fetchMock, onTournamentsChanged };
  }

  it.each([
    { isVip: false, status: 'confirmed', approvalInboxActive: false },
    { isVip: true, status: 'confirmed', approvalInboxActive: false },
    { isVip: false, status: 'pending', approvalInboxActive: false },
    { isVip: false, status: 'pending', approvalInboxActive: true },
  ])('speichert VIP von $isVip um bei $status (Freigabeeingang: $approvalInboxActive)', async (options) => {
    const { fetchMock, onTournamentsChanged } = setup(options);
    const before = options.isVip ? 'VIP an' : 'VIP aus';
    const after = options.isVip ? 'VIP aus' : 'VIP an';
    const toggle = await screen.findByRole('button', { name: before });
    expect(toggle).toHaveAttribute('aria-pressed', String(options.isVip));
    fireEvent.click(toggle);
    expect(toggle).toBeDisabled();

    const updatedToggle = await screen.findByRole('button', { name: after });
    expect(updatedToggle).toHaveAttribute('aria-pressed', String(!options.isVip));
    const update = fetchMock.mock.calls.find(([, request]) => request?.method === 'PUT');
    expect(update[0]).toBe('/api/registrations/vip-1');
    expect(JSON.parse(update[1].body)).toMatchObject({
      isVip: !options.isVip, status: options.status, firstName: 'Anna', lastName: 'Muster', club: 'BC Linden', seedingPosition: 3,
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/tournaments/t1/registrations')).toHaveLength(2);
    expect(onTournamentsChanged).toHaveBeenCalledTimes(1);
  });

  it('behält den VIP-Status bei einem fehlgeschlagenen Speichern', async () => {
    const { fetchMock, onTournamentsChanged } = setup({ fail: true });
    fireEvent.click(await screen.findByRole('button', { name: 'VIP aus' }));

    expect(await screen.findByText('Speichern fehlgeschlagen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'VIP aus' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'VIP aus' })).toBeEnabled();
    expect(onTournamentsChanged).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/tournaments/t1/registrations')).toHaveLength(1);
  });
});
