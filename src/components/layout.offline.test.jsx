import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineNotice } from './layout.jsx';
import '../lib/i18next-config.js';

describe('zentraler Offline-Hinweis', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('erklärt in jedem Bereich den schreibgeschützten Offline-Modus', () => {
    vi.stubGlobal('navigator', { onLine: false });

    render(<OfflineNotice />);

    expect(screen.getByRole('status')).toHaveTextContent('Du bist offline');
    expect(screen.getByRole('status')).toHaveTextContent('Änderungen sind bis zur Wiederverbindung deaktiviert.');
  });
});
