import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '../lib/i18next-config.js';
import { EMPTY_REGISTRATION_FORM } from '../lib/constants.js';
import { RegistrationFields } from './RegistrationFields.jsx';

const renderFields = (clubNames) => render(
  <RegistrationFields form={EMPTY_REGISTRATION_FORM} setForm={() => {}} formation="triplette" registrationType="forme" clubNames={clubNames} />,
);

describe('Turnieranmeldung: Vereinsvorschläge', () => {
  it('schlägt in allen Vereinsfeldern die Vereine aus der DB vor', () => {
    const { container } = renderFields(['BC Linden', 'Boule Club Hamburg']);
    const vereine = screen.getAllByLabelText(/^Verein/);
    expect(vereine).toHaveLength(3);

    const listId = vereine[0].getAttribute('list');
    expect(listId).toBeTruthy();
    vereine.forEach((input) => expect(input).toHaveAttribute('list', listId));
    const options = [...container.querySelectorAll(`datalist option`)].map((option) => option.value);
    expect(options).toEqual(['BC Linden', 'Boule Club Hamburg']);
    expect(container.querySelector('datalist').id).toBe(listId);
  });

  it('bleibt ohne Vereinsliste ein normales Freitextfeld', () => {
    const { container } = renderFields([]);
    screen.getAllByLabelText(/^Verein/).forEach((input) => expect(input).not.toHaveAttribute('list'));
    expect(container.querySelector('datalist')).toBeNull();
  });
});
