import { describe, expect, it } from 'vitest';
import { sanitizeScore } from './domain.js';

describe('sanitizeScore (Punkteingabe 0–13)', () => {
  it.each([
    ['', ''], ['0', '0'], ['7', '7'], ['13', '13'], ['14', '13'], ['99', '13'], ['130', '13'],
    ['-5', '5'], ['-', ''], ['1.5', '13'], ['3e', '3'], ['abc', ''], [' 8 ', '8'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeScore(input)).toBe(expected);
  });
});
