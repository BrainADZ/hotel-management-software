/** All monetary values are INR rupees, with at most two decimal places. */
export function roundRupees(value: number): number {
  // Shift decimal exponents for deterministic decimal rounding (including 1.005).
  const [digits, exponent = '0'] = String(value).split('e');
  const shifted = Math.round(Number(`${digits}e${Number(exponent) + 2}`));
  const [rounded, shiftedExponent = '0'] = String(shifted).split('e');
  return Number(`${rounded}e${Number(shiftedExponent) - 2}`);
}

export function isRupeeAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    Math.abs(value) <= 90_071_992_547.4 && roundRupees(value) === value;
}

export function money(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
