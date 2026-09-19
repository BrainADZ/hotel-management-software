import { describe, expect, it } from 'vitest';

import {
  paiseToRupees,
  rupeesToPaise,
} from './money';

describe('database money boundary', () => {
  it('stores rupees as integer paise', () => {
    expect(rupeesToPaise(4500)).toBe(450000);
    expect(rupeesToPaise(650.5)).toBe(65050);
    expect(rupeesToPaise(0.01)).toBe(1);
  });

  it('exposes stored paise as rupees', () => {
    expect(paiseToRupees(450000)).toBe(4500);
    expect(paiseToRupees(65050)).toBe(650.5);
    expect(paiseToRupees(1)).toBe(0.01);
  });

  it('rounds writes to the nearest paise', () => {
    expect(rupeesToPaise(10.005)).toBe(1001);
  });

  it('rejects invalid values', () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow();
    expect(() =>
      paiseToRupees(Number.POSITIVE_INFINITY),
    ).toThrow();
  });

  it('rejects values outside the PostgreSQL integer range', () => {
    expect(() => rupeesToPaise(30_000_000)).toThrow(
      RangeError,
    );
  });
});