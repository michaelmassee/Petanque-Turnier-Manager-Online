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
