import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { playerSearchTurnstileToken } from '../lib/player-search-turnstile.js';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { registrationPayload } from '../lib/domain.js';
import { RegistrationFields } from './RegistrationFields.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));
vi.mock('../lib/player-search-turnstile.js', () => ({ playerSearchTurnstileToken: vi.fn() }));

const player = { id: 'p1', firstName: 'Anna', lastName: 'Adler', username: 'anna', club: 'BC Linden', email: 'anna@example.test', licenseNr: 'L-123', proof: 'save-proof' };
const recipient = { id: 'p1', firstName: 'Anna', lastName: 'Adler', username: 'anna', club: 'BC Linden', role: 'user' };
const me = { id: 'me', firstName: 'Olga', lastName: 'Orga', username: 'olga', club: 'Club', emailVerifiedAt: '2026-01-01' };
const recipientCalls = () => authenticatedApi.mock.calls.filter(([path]) => path === '/api/postbox/recipients');
const detailCalls = () => authenticatedApi.mock.calls.filter(([path]) => path.endsWith('/details'));

function Harness({ enabled = true, formation = 'triplette', registrationType = 'forme', onSubmit = vi.fn(), currentUser = me }) {
  const [form, setForm] = useState({ ...EMPTY_REGISTRATION_FORM, teamName: 'Team', feeSelections: [], registrationAnswers: [] });
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(registrationPayload(form, 'de')); }}>
      <RegistrationFields form={form} setForm={setForm} formation={formation} registrationType={registrationType}
        licenseRequired teamNameEnabled tournamentId="t1" turnstileSiteKey="site-key" playerSearchEnabled={enabled}
        currentUserId={currentUser?.id} currentUser={currentUser} />
      <button type="submit">Save</button>
    </form>
  </QueryClientProvider>;
}

async function choose(section, user) {
  await user.type(within(section).getByLabelText(/^Vorname/), 'Anna');
  await user.click(await screen.findByRole('option', { name: /Anna Adler/ }));
  await waitFor(() => expect(within(section).getByLabelText(/^E-Mail/)).toHaveValue('anna@example.test'));
}

describe('Registration player selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerSearchTurnstileToken.mockResolvedValue('fresh-token');
    authenticatedApi.mockImplementation(async (path) => path === '/api/postbox/recipients'
      ? { recipients: [recipient], tournaments: [] }
      : { player });
  });

  it.each([
    ['tete', 'forme', 1], ['doublette', 'forme', 2], ['triplette', 'forme', 3],
    ['triplette', 'melee', 1], ['doublette', 'supermelee', 1],
  ])('offers only the applicable slots for %s / %s', (formation, registrationType, count) => {
    render(<Harness formation={formation} registrationType={registrationType} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(count * 2);
    expect(authenticatedApi).not.toHaveBeenCalled();
    expect(playerSearchTurnstileToken).not.toHaveBeenCalled();
  });

  it('keeps guest entry manual and does not request any data', () => {
    render(<Harness enabled={false} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(authenticatedApi).not.toHaveBeenCalled();
  });

  it('filters the shared postbox directory locally and challenges only the detail request', async () => {
    const user = userEvent.setup();
    render(<Harness formation="tete" />);
    await user.type(screen.getByLabelText(/^Vorname/), 'Anna');
    await screen.findByRole('option', { name: /Anna Adler/ });
    await user.type(screen.getByLabelText(/^Nachname/), 'Ad');
    expect(screen.getByRole('option', { name: /Anna Adler/ })).toBeInTheDocument();
    expect(recipientCalls()).toHaveLength(1);
    expect(detailCalls()).toHaveLength(0);
    expect(playerSearchTurnstileToken).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('');
    await user.click(screen.getByRole('option', { name: /Anna Adler/ }));
    await waitFor(() => expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('anna@example.test'));
    expect(screen.queryByRole('button', { name: 'Auswahl aufheben' })).toBeNull();
    expect(screen.queryByText('Mit Benutzerkonto verbunden')).toBeNull();
    expect(screen.getByLabelText(/^Vorname/)).toHaveValue('Anna');
    expect(screen.getByLabelText(/^Nachname/)).toHaveValue('Adler');
    expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('anna@example.test');
    expect(screen.getByLabelText(/^Lizenznummer/)).toHaveValue('L-123');
    expect(playerSearchTurnstileToken.mock.calls.map((call) => call[2])).toEqual(['registration_player_details']);
    expect(JSON.parse(detailCalls()[0][1].body)).toEqual({ userId: 'p1', turnstileToken: 'fresh-token', shareToken: '' });
  });

  it('keeps free entry: unknown names show no list and submit without a selection', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(<Harness formation="tete" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/^Vorname/), 'Bernd');
    await user.type(screen.getByLabelText(/^Nachname/), 'Neu');
    await waitFor(() => expect(recipientCalls()).toHaveLength(1));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByText('Keine Spieler gefunden.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.submit(container.querySelector('form'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Bernd', lastName: 'Neu' }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('playerSelections');
  });

  it('keeps typing free when a suggestion is ignored', async () => {
    const user = userEvent.setup();
    render(<Harness formation="tete" />);
    const first = screen.getByLabelText(/^Vorname/);
    await user.type(first, 'Ann');
    await screen.findByRole('option', { name: /Anna Adler/ });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.type(first, 'ette');
    expect(first).toHaveValue('Annette');
    expect(first).not.toHaveAttribute('readonly');
    expect(detailCalls()).toHaveLength(0);
  });

  it('offers the own verified account even though the postbox list excludes it', async () => {
    const user = userEvent.setup();
    authenticatedApi.mockImplementation(async (path) => path === '/api/postbox/recipients'
      ? { recipients: [recipient], tournaments: [] } : { player: { ...player, id: 'me', firstName: 'Olga', lastName: 'Orga' } });
    render(<Harness formation="tete" />);
    await user.type(screen.getByLabelText(/^Nachname/), 'Orga');
    await user.click(await screen.findByRole('option', { name: /Olga Orga/ }));
    await waitFor(() => expect(detailCalls()).toHaveLength(1));
    expect(JSON.parse(detailCalls()[0][1].body)).toMatchObject({ userId: 'me' });
  });

  it('copies the chosen slot, preserves team information, sends its receipt and clears it when the name changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(<Harness onSubmit={onSubmit} />);
    const sections = container.querySelectorAll('.registration-section');
    const second = [...sections].find((section) => within(section).queryByRole('heading', { name: 'Spieler 2' }));
    await choose(second, user);
    expect(within(second).getByLabelText(/^Vorname/)).toHaveValue('Anna');
    expect(within(second).getByLabelText(/^Vorname/)).not.toHaveAttribute('readonly');
    expect(within(second).getByLabelText(/^E-Mail/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Teamname')).toHaveValue('Team');
    fireEvent.submit(container.querySelector('form'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      teamName: 'Team', partnerFirstName: 'Anna', partnerEmail: 'anna@example.test',
      playerSelections: { partner: { userId: 'p1', proof: 'save-proof', licenseNr: 'L-123' } },
    }));
    await user.type(within(second).getByLabelText(/^Vorname/), 'e');
    expect(within(second).getByLabelText(/^Vorname/)).toHaveValue('Annae');
    expect(within(second).getByLabelText(/^E-Mail/)).not.toHaveAttribute('readonly');
    fireEvent.submit(container.querySelector('form'));
    expect(onSubmit.mock.calls.at(-1)[0]).not.toHaveProperty('playerSelections');
  });

  it('allows adding a missing required licence and hides an already selected account from other slots', async () => {
    const user = userEvent.setup();
    authenticatedApi.mockImplementation(async (path) => path === '/api/postbox/recipients'
      ? { recipients: [recipient], tournaments: [] } : { player: { ...player, licenseNr: null } });
    const { container } = render(<Harness formation="doublette" />);
    const sections = [...container.querySelectorAll('.registration-section')];
    const first = sections.find((section) => within(section).queryByRole('heading', { name: 'Spieler 1' }));
    const second = sections.find((section) => within(section).queryByRole('heading', { name: 'Spieler 2' }));
    await choose(first, user);
    const license = within(first).getByLabelText(/^Lizenznummer/);
    expect(license).not.toHaveAttribute('readonly');
    await user.type(license, 'L-456');
    expect(license).toHaveValue('L-456');
    await user.type(within(second).getByLabelText(/^Vorname/), 'Anna');
    expect(screen.queryByRole('option', { name: /Anna Adler/ })).toBeNull();
    expect(recipientCalls()).toHaveLength(1);
  });

  it('shows detail errors without automatic retries and preserves form input', async () => {
    const user = userEvent.setup();
    authenticatedApi.mockImplementation(async (path) => {
      if (path === '/api/postbox/recipients') return { recipients: [recipient], tournaments: [] };
      throw new Error('Zu viele Spielersuchen. Bitte warte eine Minute und versuche es erneut.');
    });
    render(<Harness formation="tete" />);
    await user.type(screen.getByLabelText(/^Vorname/), 'Anna');
    await user.click(await screen.findByRole('option', { name: /Anna Adler/ }));
    await screen.findByRole('alert');
    expect(detailCalls()).toHaveLength(1);
    expect(screen.getByLabelText(/^Vorname/)).toHaveValue('Anna');
    expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('');
  });

  it('does not call the API when the security check fails', async () => {
    const user = userEvent.setup();
    playerSearchTurnstileToken.mockRejectedValue(new Error('failed'));
    render(<Harness formation="tete" />);
    await user.type(screen.getByLabelText(/^Vorname/), 'Anna');
    await user.click(await screen.findByRole('option', { name: /Anna Adler/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sicherheitsprüfung fehlgeschlagen.'));
    expect(detailCalls()).toHaveLength(0);
  });

  it('supports surname autocomplete and selecting a suggestion with the keyboard', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness formation="tete" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/^Nachname/), 'Adler');
    await screen.findByRole('option', { name: /Anna Adler/ });
    await user.keyboard('{ArrowDown}');
    const field = screen.getByLabelText(/^Nachname/);
    expect(field).toHaveAttribute('aria-activedescendant', screen.getByRole('option').id);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('anna@example.test'));
    expect(screen.getByLabelText(/^Vorname/)).toHaveValue('Anna');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('limits the list to 20 suggestions with a hint', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, firstName: 'Many', lastName: `Player${i}`, role: 'user' }));
    authenticatedApi.mockImplementation(async () => ({ recipients: many, tournaments: [] }));
    render(<Harness formation="tete" />);
    await user.type(screen.getByLabelText(/^Vorname/), 'Many');
    await screen.findAllByRole('option');
    expect(screen.getAllByRole('option')).toHaveLength(20);
    expect(screen.getByText('Bitte die Suche eingrenzen, um weitere Spieler zu finden.')).toBeInTheDocument();
  });
});
