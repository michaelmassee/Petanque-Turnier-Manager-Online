// Eigenes E-Mail-Gateway im Profil: speichern, Test-Mail mit sichtbarer Rückmeldung, Geheimnis bleibt verborgen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import MailGatewayPanel from './MailGatewayPanel.jsx';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const saved = {
  available: true, configured: true, enabled: true, provider: 'smtp', smtpHost: 'smtp.verein.example', smtpPort: 587,
  smtpSecurity: 'starttls', smtpUser: 'turniere@verein.example', fromEmail: 'turniere@verein.example', fromName: 'BC Verein',
  replyTo: '', hasSecret: true, status: 'untested', lastError: null, lastErrorAt: null, lastSuccessAt: null,
};

describe('MailGatewayPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('speichert ein SMTP-Gateway und meldet danach, dass eine Test-Mail fehlt', async () => {
    const onChanged = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init = {}) => {
      if (init.method === 'PUT') return jsonResponse({ gateway: saved });
      return jsonResponse({ gateway: { available: true, configured: false } });
    });
    render(<MailGatewayPanel onChanged={onChanged} />);

    fireEvent.change(await screen.findByLabelText(/SMTP-Server/), { target: { value: 'smtp.verein.example' } });
    fireEvent.change(screen.getByLabelText(/Benutzername/), { target: { value: 'turniere@verein.example' } });
    fireEvent.change(screen.getByLabelText(/Passwort/, { selector: 'input' }), { target: { value: 'geheim' } });
    fireEvent.change(screen.getByLabelText(/Absenderadresse/), { target: { value: 'turniere@verein.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Gateway gespeichert. Bitte jetzt eine Test-Mail senden.')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(init.body)).toMatchObject({ provider: 'smtp', smtpHost: 'smtp.verein.example', smtpPort: 587, secret: 'geheim', enabled: true });
    expect(onChanged).toHaveBeenCalledWith(true);
    expect(screen.getByText('Noch nicht getestet – bitte eine Test-Mail senden.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Passwort/, { selector: 'input' })).toHaveValue('');
    expect(screen.getByLabelText(/Passwort/, { selector: 'input' })).toHaveAttribute('placeholder', 'Gespeichert – leer lassen, um es beizubehalten');
  });

  it('zeigt den Fehler einer Test-Mail mit dem Grund des Mailservers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init = {}) => {
      if (init.method === 'POST') {
        return jsonResponse({ sent: false, error: '535 Authentication failed', gateway: { ...saved, status: 'error', lastError: '535 Authentication failed' } }, 502);
      }
      return jsonResponse({ gateway: saved });
    });
    render(<MailGatewayPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Test-Mail senden' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Test-Mail fehlgeschlagen: 535 Authentication failed');
    await waitFor(() => expect(screen.getByText(/Fehler – Turnier-Mails gehen zurzeit nicht raus/)).toBeInTheDocument());
  });

  it('entfernt das Gateway erst nach Rückfrage', async () => {
    const onChanged = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init = {}) => (
      init.method === 'DELETE' ? jsonResponse({ gateway: { available: true, configured: false } }) : jsonResponse({ gateway: saved })));
    render(<MailGatewayPanel onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Entfernen' }));
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.querySelector('.button-danger'));

    expect(await screen.findByText('Eigenes E-Mail-Gateway entfernt.')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith(false);
  });

  it('zeigt einen Hinweis statt des Formulars, wenn der Server keine eigenen Gateways anbietet', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ gateway: { available: false, configured: false } }));
    render(<MailGatewayPanel />);
    expect(await screen.findByText('Eigene E-Mail-Gateways sind auf diesem Server nicht verfügbar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
  });
});
