import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../lib/i18next-config.js';
import { authenticatedApi } from '../lib/api.js';
import { playerSearchTurnstileToken } from '../lib/player-search-turnstile.js';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { registrationPayload } from '../lib/domain.js';
import { RegistrationFields } from './RegistrationFields.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn() }));
vi.mock('../lib/player-search-turnstile.js', () => ({ playerSearchTurnstileToken: vi.fn() }));

const player = { id: 'p1', firstName: 'Anna', lastName: 'Adler', username: 'anna', club: 'BC Linden', email: 'anna@example.test', licenseNr: 'L-123', proof: 'save-proof' };
function Harness({ enabled = true, formation = 'triplette', registrationType = 'forme', onSubmit = vi.fn() }) {
  const [form, setForm] = useState({ ...EMPTY_REGISTRATION_FORM, teamName: 'Team', feeSelections: [], registrationAnswers: [] });
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(registrationPayload(form, 'de')); }}>
    <RegistrationFields form={form} setForm={setForm} formation={formation} registrationType={registrationType}
      licenseRequired teamNameEnabled tournamentId="t1" turnstileSiteKey="site-key" playerSearchEnabled={enabled} />
    <button type="submit">Save</button>
  </form>;
}

async function choose(section, user) {
  await user.click(within(section).getByRole('button', { name: 'Registrierten Spieler suchen' }));
  await user.type(within(section).getByRole('searchbox'), 'Anna');
  await user.click(within(section).getByRole('button', { name: 'Suchen' }));
  await user.click(await within(section).findByRole('button', { name: /Anna Adler/ }));
  await within(section).findByRole('button', { name: 'Auswahl aufheben' });
}

describe('Registration player selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerSearchTurnstileToken.mockResolvedValue('fresh-token');
    authenticatedApi.mockImplementation(async (path) => path.endsWith('/search')
      ? { players: [{ ...player, email: undefined, licenseNr: undefined, proof: 'search-proof' }] }
      : { player });
  });

  it.each([
    ['tete', 'forme', 1], ['doublette', 'forme', 2], ['triplette', 'forme', 3],
    ['triplette', 'melee', 1], ['doublette', 'supermelee', 1],
  ])('offers only the applicable slots for %s / %s', (formation, registrationType, count) => {
    render(<Harness formation={formation} registrationType={registrationType} />);
    expect(screen.getAllByRole('button', { name: 'Registrierten Spieler suchen' })).toHaveLength(count);
    expect(authenticatedApi).not.toHaveBeenCalled();
    expect(playerSearchTurnstileToken).not.toHaveBeenCalled();
  });

  it('keeps guest entry manual and does not request any data', () => {
    render(<Harness enabled={false} />);
    expect(screen.queryByRole('button', { name: 'Registrierten Spieler suchen' })).toBeNull();
    expect(screen.getAllByLabelText(/^Vorname/)[0]).not.toHaveAttribute('readonly');
    expect(authenticatedApi).not.toHaveBeenCalled();
  });

  it('searches only on explicit action and separately verifies the detail request', async () => {
    const user = userEvent.setup();
    render(<Harness formation="tete" />);
    await user.click(screen.getByRole('button', { name: 'Registrierten Spieler suchen' }));
    await user.type(screen.getByRole('searchbox'), 'Anna');
    expect(authenticatedApi).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await screen.findByRole('button', { name: /Anna Adler/ });
    expect(authenticatedApi).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /Anna Adler/ }));
    await screen.findByRole('button', { name: 'Auswahl aufheben' });
    expect(screen.getByLabelText(/^E-Mail/)).toHaveValue('anna@example.test');
    expect(screen.getByLabelText(/^Lizenznummer/)).toHaveValue('L-123');
    expect(playerSearchTurnstileToken.mock.calls.map((call) => call[2]))
      .toEqual(['registration_player_search', 'registration_player_details']);
    expect(JSON.parse(authenticatedApi.mock.calls[1][1].body)).toMatchObject({ userId: 'p1', proof: 'search-proof', turnstileToken: 'fresh-token' });
  });

  it('copies the chosen slot, preserves team information, sends its receipt and allows clearing it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(<Harness onSubmit={onSubmit} />);
    const sections = container.querySelectorAll('.registration-section');
    const second = [...sections].find((section) => within(section).queryByRole('heading', { name: 'Spieler 2' }));
    await choose(second, user);
    expect(within(second).getByLabelText(/^Vorname/)).toHaveValue('Anna');
    expect(within(second).getByLabelText(/^Vorname/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Teamname')).toHaveValue('Team');
    fireEvent.submit(container.querySelector('form'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      teamName: 'Team', partnerFirstName: 'Anna', partnerEmail: 'anna@example.test',
      playerSelections: { partner: { userId: 'p1', proof: 'save-proof', licenseNr: 'L-123' } },
    }));
    await user.click(within(second).getByRole('button', { name: 'Auswahl aufheben' }));
    expect(within(second).getByLabelText(/^Vorname/)).not.toHaveAttribute('readonly');
    fireEvent.submit(container.querySelector('form'));
    expect(onSubmit.mock.calls.at(-1)[0]).not.toHaveProperty('playerSelections');
  });

  it('allows adding a missing required licence and hides an already selected account from other slots', async () => {
    const user = userEvent.setup();
    authenticatedApi.mockImplementation(async (path) => path.endsWith('/search') ? { players: [player] } : { player: { ...player, licenseNr: null } });
    const { container } = render(<Harness formation="doublette" />);
    const sections = [...container.querySelectorAll('.registration-section')];
    const first = sections.find((section) => within(section).queryByRole('heading', { name: 'Spieler 1' }));
    const second = sections.find((section) => within(section).queryByRole('heading', { name: 'Spieler 2' }));
    await choose(first, user);
    const license = within(first).getByLabelText(/^Lizenznummer/);
    expect(license).not.toHaveAttribute('readonly');
    await user.type(license, 'L-456');
    expect(license).toHaveValue('L-456');
    await user.click(within(second).getByRole('button', { name: 'Registrierten Spieler suchen' }));
    await user.type(within(second).getByRole('searchbox'), 'Anna');
    await user.click(within(second).getByRole('button', { name: 'Suchen' }));
    await within(second).findByText('Keine Spieler gefunden.');
    expect(within(second).queryByRole('button', { name: /Anna Adler/ })).toBeNull();
  });

  it('shows rate-limit errors without automatic retries and preserves form input', async () => {
    const user = userEvent.setup();
    authenticatedApi.mockRejectedValue(new Error('Zu viele Spielersuchen. Bitte warte eine Minute und versuche es erneut.'));
    render(<Harness formation="tete" />);
    await user.type(screen.getByLabelText(/^Vorname/), 'Manuell');
    await user.click(screen.getByRole('button', { name: 'Registrierten Spieler suchen' }));
    await user.type(screen.getByRole('searchbox'), 'Anna');
    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    await screen.findByRole('alert');
    expect(authenticatedApi).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Vorname/)).toHaveValue('Manuell');
  });

  it('does not call the API when the security check fails', async () => {
    const user = userEvent.setup();
    playerSearchTurnstileToken.mockRejectedValue(new Error('failed'));
    render(<Harness formation="tete" />);
    await user.click(screen.getByRole('button', { name: 'Registrierten Spieler suchen' }));
    await user.type(screen.getByRole('searchbox'), 'Anna');
    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sicherheitsprüfung fehlgeschlagen.'));
    expect(authenticatedApi).not.toHaveBeenCalled();
  });
});
