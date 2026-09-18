import { describe, expect, it } from 'vitest';
import { rupeeInputValue, parseRupees } from './rupee-input';

describe('rupee form boundary', () => {
  it.each([[100, '1.00'], [123456, '1234.56'], [29, '0.29'], [0, '0.00']])('round trips stored amount %s', (stored, input) => {
    expect(rupeeInputValue(stored)).toBe(input);
    expect(parseRupees(input)).toBe(stored);
  });
  it('preserves blank optional amounts', () => { expect(rupeeInputValue(undefined)).toBe(''); });
  it.each(['1.001', '-1', 'NaN', '1e3', 'Infinity', '9007199254740992'])('rejects invalid input %s', value => {
    expect(() => parseRupees(value)).toThrow();
  });
});
