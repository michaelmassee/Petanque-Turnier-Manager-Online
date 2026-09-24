import { describe, expect, it } from 'vitest';
import { registrationsToCsv } from './RegistrationsManagement.jsx';

const t = (key) => key;

describe('registrationsToCsv', () => {
  it('exportiert Startgeld-Tarife in der Turnierwährung', () => {
    const csv = registrationsToCsv(
      [{ id: 'r1', firstName: 'Anna', feeSelections: [{ name: 'Mitglied', amountCents: 500 }], feeTotalCents: 500 }],
      { currency: 'EUR', registrationQuestions: [] },
      t,
    );
    const [, row] = csv.trim().split('\r\n');
    expect(row).toContain('Mitglied (5,00');
    expect(row).toMatch(/5,00\s€/);
  });

  it('exportiert Anmeldungen ohne Startgeld mit leeren Geldspalten', () => {
    const csv = registrationsToCsv([{ id: 'r1', firstName: 'Anna' }], { registrationQuestions: [] }, t);
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });
});
