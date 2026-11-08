import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { RegistrationFields } from './RegistrationFields.jsx';

const QUESTIONS = [{ id: 'essen', label: 'Essen', type: 'choice', options: [{ id: 'veggie', label: 'Vegetarisch' }, { id: 'nichts', label: 'Nichts' }] }];

function Harness({ requireChoices, onForm }) {
  const [form, setForm] = useState({ ...EMPTY_REGISTRATION_FORM, registrationAnswers: [] });
  onForm?.(form);
  return <RegistrationFields form={form} setForm={setForm} formation="doublette" registrationType="forme" registrationQuestions={QUESTIONS} requireChoices={requireChoices} />;
}

describe('Turnieranmeldung: Auswahlfragen', () => {
  it('startet leer, ist bei der Selbstanmeldung Pflicht und speichert den Eintrag', () => {
    let latest;
    render(<Harness requireChoices onForm={(form) => { latest = form; }} />);
    const [primary, partner] = screen.getAllByRole('combobox', { name: /Essen/ });
    expect(primary).toHaveValue('');
    expect(primary).toBeRequired();
    expect(partner).toBeRequired();
    expect(screen.getAllByRole('option', { name: 'Bitte wählen …' })).toHaveLength(2);

    fireEvent.change(primary, { target: { value: 'veggie' } });
    expect(latest.registrationAnswers).toEqual([{ participant: 'primary', questionId: 'essen', optionId: 'veggie' }]);
    fireEvent.change(primary, { target: { value: '' } });
    expect(latest.registrationAnswers).toEqual([]);
  });

  it('ist für die Turnierleitung freiwillig', () => {
    render(<Harness requireChoices={false} />);
    screen.getAllByRole('combobox', { name: /Essen/ }).forEach((select) => expect(select).not.toBeRequired());
  });
});
