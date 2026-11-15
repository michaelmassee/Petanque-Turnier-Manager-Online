import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { RegistrationLogDialog, registrationLogActor, registrationLogText } from './RegistrationLogDialog.jsx';

const t = (key, values = {}) => key.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name]);

const ENTRIES = [
  { id: 'e2', participant: 'Les Boulistes (Anna A + Ben B)', action: 'status_changed', target: 'registration',
    details: { from: 'pending', to: 'confirmed', bulk: true }, actorRole: 'owner', actorName: 'Lea Leitung', createdAt: '2026-09-02T10:00:00.000Z' },
  { id: 'e1', participant: 'Carla C', registrationDeleted: true, action: 'registration_deleted', target: 'registration',
    details: { status: 'waitlist' }, actorRole: 'document', actorName: null, createdAt: '2026-09-01T10:00:00.000Z' },
];

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.restoreAllMocks());

describe('Protokoll der Meldeliste', () => {
  it('formuliert die Vorgänge lesbar', () => {
    expect(registrationLogText({ action: 'composition_changed', target: 'slot:2', details: { from: 'Ben B', to: 'Bea B' } }, t))
      .toBe('Spieler 2: Ben B → Bea B');
    expect(registrationLogText({ action: 'vip_changed', details: { from: 0, to: 3 } }, t)).toBe('VIP-Stufe: kein VIP → VIP Gold');
    expect(registrationLogText({ action: 'status_changed', details: { from: 'pending', to: 'rejected', reason: 'Voll' } }, t))
      .toBe('Status: Offen → Abgelehnt – Voll');
    expect(registrationLogText({ action: 'club_changed', target: 'slot:1', details: { from: 'BC A', to: '' } }, t))
      .toBe('Verein Spieler 1: BC A → –');
    expect(registrationLogText({ action: 'seeding_changed', details: { from: null, to: 2 } }, t)).toBe('Setzposition: – → 2');
    expect(registrationLogText({ action: 'participation_changed', details: { from: 'inactive', to: 'active', tournamentStart: true } }, t))
      .toBe('Teilnahme: Inaktiv → Aktiv (beim Turnierstart)');
    expect(registrationLogText({ action: 'participation_changed', details: { from: 'active', to: 'inactive', bulk: true } }, t))
      .toBe('Teilnahme: Aktiv → Inaktiv (Alle deaktivieren)');
    expect(registrationLogText({ action: 'participation_changed', details: { from: 'active', to: 'withdrawn' } }, t))
      .toBe('Teilnahme: Aktiv → Ausgesetzt');
    expect(registrationLogText({ action: 'fees_changed', details: {} }, t)).toBe('Gebührenauswahl geändert');
    expect(registrationLogText({ action: 'unbekannt', details: {} }, t)).toBe('unbekannt');
    expect(registrationLogActor({ actorRole: 'player' }, t)).toBe('Spieler');
    expect(registrationLogActor({ actorRole: 'editor', actorName: 'Max M' }, t)).toBe('Max M (Mitverwaltung)');
  });

  it('lädt die Einträge der Turnierleitung und filtert per Suche', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ entries: ENTRIES, limit: 500 }));
    render(<RegistrationLogDialog tournament={{ id: 't1', name: 'Sommer Cup', timezone: 'Europe/Berlin' }} onClose={() => {}} />);

    expect(await screen.findByText('Les Boulistes (Anna A + Ben B)')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/tournaments/t1/registration-log');
    expect(screen.getByText('Status: Offen → Bestätigt (Alle bestätigen)')).toBeInTheDocument();
    expect(screen.getByText('Lea Leitung (Turnierleitung)')).toBeInTheDocument();
    expect(screen.getByText('Meldung gelöscht (zuletzt Warteliste)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Protokoll durchsuchen'), { target: { value: 'carla' } });
    expect(screen.queryByText('Les Boulistes (Anna A + Ben B)')).not.toBeInTheDocument();
    expect(screen.getByText('Carla C')).toBeInTheDocument();
  });

  it('zeigt einen Fehler sichtbar an', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ error: 'Zugriff verweigert' }, 403));
    render(<RegistrationLogDialog tournament={{ id: 't1', name: 'Sommer Cup' }} onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Zugriff verweigert');
  });

  it('meldet ein leeres Protokoll', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ entries: [], limit: 500 }));
    render(<RegistrationLogDialog tournament={{ id: 't1', name: 'Sommer Cup' }} onClose={() => {}} />);
    expect(await screen.findByText('Noch keine Änderungen protokolliert.')).toBeInTheDocument();
  });
});
