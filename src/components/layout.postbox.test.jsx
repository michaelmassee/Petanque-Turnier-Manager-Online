import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostboxControl } from './layout.jsx';
import { serializeRichText } from '../lib/rich-text.js';
import '../lib/i18next-config.js';

const richBody = (text) => serializeRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] });

function renderPostbox(props = {}) {
  const defaults = {
    open: true, unreadCount: 0, messages: [], recipients: [], recipientId: 'user-2', setRecipientId: vi.fn(),
    body: '', setBody: vi.fn(), onToggle: vi.fn(), onClose: vi.fn(), onRead: vi.fn(), onSubmit: vi.fn(), currentUserId: 'user-1',
  };
  return render(<PostboxControl {...defaults} {...props} />);
}

describe('Postbox-Nachricht mit Editor', () => {
  it('zählt nur sichtbare Zeichen und sperrt das Senden über 500 Zeichen', () => {
    const { rerender } = renderPostbox({ body: richBody('Hallo') });
    expect(screen.getAllByText('Nachricht (5/500)').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Senden' })).toBeEnabled();

    rerender(<PostboxControl open unreadCount={0} messages={[]} recipients={[]} recipientId="user-2" setRecipientId={vi.fn()} body={richBody('x'.repeat(501))} setBody={vi.fn()} onToggle={vi.fn()} onClose={vi.fn()} onRead={vi.fn()} onSubmit={vi.fn()} currentUserId="user-1" />);
    expect(screen.getByText('Die Nachricht ist zu lang (maximal 500 Zeichen).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();
  });

  it('leert den Editor, wenn der Text nach dem Senden zurückgesetzt wird', () => {
    const props = { open: true, unreadCount: 0, messages: [], recipients: [], recipientId: 'user-2', setRecipientId: vi.fn(), setBody: vi.fn(), onToggle: vi.fn(), onClose: vi.fn(), onRead: vi.fn(), onSubmit: vi.fn(), currentUserId: 'user-1' };
    const { rerender, container } = render(<PostboxControl {...props} body={richBody('Entwurf')} />);
    expect(container.querySelector('.tiptap')).toHaveTextContent('Entwurf');

    rerender(<PostboxControl {...props} body="" />);
    expect(container.querySelector('.tiptap')).not.toHaveTextContent('Entwurf');
  });

  it('zeigt formatierte und alte Klartext-Nachrichten an', () => {
    renderPostbox({ messages: [
      { id: 'm1', kind: 'direct', body: richBody('Wichtig'), senderName: 'Anna', createdAt: '2026-10-06T08:00:00Z', readAt: null, mine: false },
      { id: 'm2', kind: 'direct', body: 'Alter Text', senderName: 'Ben', createdAt: '2026-10-06T08:00:00Z', readAt: null, mine: false },
    ] });
    expect(screen.getByText('Wichtig').tagName).toBe('STRONG');
    expect(screen.getByText('Alter Text')).toBeInTheDocument();
  });
});

describe('Postbox-Nachricht mit Link', () => {
  it('lässt Links klicken und öffnet die Nachricht über Kopf-Button oder Klick auf die Karte', () => {
    const onRead = vi.fn();
    const message = { id: 'm1', kind: 'direct', body: 'Infos: https://ptmonline.org', senderName: 'Anna', createdAt: '2026-10-06T08:00:00Z', readAt: null, mine: false };
    renderPostbox({ messages: [message], onRead });

    const link = screen.getByRole('link', { name: 'https://ptmonline.org' });
    expect(link.closest('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Anna' }));
    expect(onRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Infos:', { exact: false }));
    expect(onRead).toHaveBeenCalledTimes(2);
    expect(onRead).toHaveBeenCalledWith(message);
  });
});

describe('Statusmeldungen zur Anmeldung', () => {
  it('nennt bei der eigenen Anmeldung keinen leeren Teilnehmernamen und bleibt anklickbar', () => {
    const onRead = vi.fn();
    const message = {
      id: 'm-status', kind: 'system', eventType: 'registration_status_changed',
      eventData: { tournamentId: 't1', tournamentName: 'Sonntag Chill Kill Turnier', status: 'pending', ownRegistration: true },
      createdAt: '2026-10-10T08:56:21Z', readAt: null, mine: false,
    };
    renderPostbox({ messages: [message], onRead });

    expect(screen.getByText('Sonntag Chill Kill Turnier: Deine Anmeldung Offen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Statusmeldung' }));
    expect(onRead).toHaveBeenCalledWith(message);
  });
});

describe('Links in Postbox-Nachrichten', () => {
  it('navigiert bei eigenen Links in der App und lässt externe Links normal öffnen', () => {
    const onNavigate = vi.fn();
    const onRead = vi.fn();
    renderPostbox({ onNavigate, onRead, messages: [
      { id: 'm1', kind: 'direct', body: 'Turnier: https://ptmonline.org/turniere/t1/info Infos: https://example.org/flyer', senderName: 'Anna', createdAt: '2026-10-06T08:00:00Z', readAt: null, mine: false },
    ] });

    expect(fireEvent.click(screen.getByRole('link', { name: 'https://ptmonline.org/turniere/t1/info' }))).toBe(false);
    expect(onNavigate).toHaveBeenCalledWith('/turniere/t1/info');

    onNavigate.mockClear();
    const external = screen.getByRole('link', { name: 'https://example.org/flyer' });
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(fireEvent.click(external)).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
