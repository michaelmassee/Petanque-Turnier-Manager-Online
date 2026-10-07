import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../lib/i18next-config.js';
import { UsernameConfirmNotice } from './UsernameConfirmNotice.jsx';

vi.mock('../lib/api.js', () => ({ authenticatedApi: vi.fn(async () => ({ ok: true })) }));
const { authenticatedApi } = await import('../lib/api.js');

describe('UsernameConfirmNotice', () => {
  it('zeigt den vergebenen Namen und bestätigt ihn mit „Passt so“', async () => {
    const onConfirmed = vi.fn();
    const onChange = vi.fn();
    render(<UsernameConfirmNotice username="anna.schmidt" onConfirmed={onConfirmed} onChange={onChange} />);

    expect(screen.getByText(/@anna\.schmidt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ändern' }));
    expect(onChange).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Passt so' }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(authenticatedApi).toHaveBeenCalledWith('/api/me/username/confirm', { method: 'POST' });
  });
});
