import { customType } from 'drizzle-orm/pg-core';

const PG_INTEGER_MIN = -2_147_483_648;
const PG_INTEGER_MAX = 2_147_483_647;

export function rupeesToPaise(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Money value must be a finite number.');
  }

  const adjusted =
    value >= 0
      ? value + Number.EPSILON
      : value - Number.EPSILON;

  const paise = Math.round(adjusted * 100);

  if (
    !Number.isSafeInteger(paise) ||
    paise < PG_INTEGER_MIN ||
    paise > PG_INTEGER_MAX
  ) {
    throw new RangeError(
      'Money value exceeds the PostgreSQL integer paise range.',
    );
  }

  return paise;
}

export function paiseToRupees(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      'Stored money value must be a finite number.',
    );
  }

  return value / 100;
}

/**
 * Application/domain/API code works in rupees.
 * PostgreSQL stores the same value as integer paise.
 *
 * Example:
 *   app writes 4500.50
 *   DB stores 450050
 *   DB returns 450050
 *   app receives 4500.50
 */
export const paiseMoney = customType<{
  data: number;
  driverData: number;
}>({
  dataType() {
    return 'integer';
  },

  toDriver(value) {
    return rupeesToPaise(value);
  },

  fromDriver(value) {
    return paiseToRupees(value);
  },
});