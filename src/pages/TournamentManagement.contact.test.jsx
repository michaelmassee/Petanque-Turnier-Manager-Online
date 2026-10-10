import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../lib/i18next-config.js';
import { TournamentManagementPage } from './TournamentManagement.jsx';

describe('Neues Turnier: Kontakt aus dem Profil', () => {
  const renderPage = (currentUser) => render(
    <QueryClientProvider client={new QueryClient()}>
      <TournamentManagementPage tournaments={[]} currentUser={currentUser} language="de" setSelectedTournamentId={() => {}} />
    </QueryClientProvider>,
  );

  it('belegt Kontaktname, E-Mail und Handynummer vor', () => {
    renderPage({ id: 'u1', firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', phone: '+49 171 1234567', role: 'user' });
    fireEvent.click(screen.getByRole('button', { name: 'Neues Turnier' }));

    expect(screen.getByLabelText(/^Kontakt-Telefon/)).toHaveValue('+49 171 1234567');
    expect(screen.getByDisplayValue('anna@example.test')).toBeInTheDocument();
  });

  it('lässt das Kontakt-Telefon leer, wenn im Profil keine Nummer steht', () => {
    renderPage({ id: 'u1', firstName: 'Anna', lastName: 'Schmidt', email: 'anna@example.test', phone: null, role: 'user' });
    fireEvent.click(screen.getByRole('button', { name: 'Neues Turnier' }));

    expect(screen.getByLabelText(/^Kontakt-Telefon/)).toHaveValue('');
  });
});
