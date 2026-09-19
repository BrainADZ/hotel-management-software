import type { FolioTotals, MoneyLine, TaxMode } from './types';

const MONEY_EPSILON = 1e-9;

function toPaise(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative rupee amount.`);
  }

  const paise = Math.round((value + Number.EPSILON) * 100);

  if (
    !Number.isSafeInteger(paise) ||
    Math.abs(value - paise / 100) > MONEY_EPSILON
  ) {
    throw new Error(`${field} must have at most two decimal places.`);
  }

  return paise;
}

function fromPaise(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Calculated money value is outside the safe range.');
  }
  return value / 100;
}

export function calculateLine(
  quantity: number,
  unitAmountRupees: number,
  discountRupees: number,
  taxRateBps: number,
  taxMode: TaxMode,
): MoneyLine {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new Error('Quantity must be a positive integer.');
  }

  const unitAmountPaise = toPaise(unitAmountRupees, 'Unit amount');
  const discountPaise = toPaise(discountRupees, 'Discount');

  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
    throw new Error('Tax rate is invalid.');
  }

  const subtotalPaise = quantity * unitAmountPaise;
  if (!Number.isSafeInteger(subtotalPaise)) {
    throw new Error('Charge total is outside the safe range.');
  }
  if (discountPaise > subtotalPaise) {
    throw new Error('Discount exceeds the charge.');
  }

  const taxableAmountPaise = subtotalPaise - discountPaise;
  const taxPaise =
    taxMode === 'EXEMPT'
      ? 0
      : Math.round((taxableAmountPaise * taxRateBps) / 10000);

  const cgstPaise = taxMode === 'CGST_SGST' ? Math.floor(taxPaise / 2) : 0;
  const sgstPaise = taxMode === 'CGST_SGST' ? taxPaise - cgstPaise : 0;
  const igstPaise = taxMode === 'IGST' ? taxPaise : 0;

  return {
    subtotalRupees: fromPaise(subtotalPaise),
    discountRupees: fromPaise(discountPaise),
    taxableAmountRupees: fromPaise(taxableAmountPaise),
    taxRupees: fromPaise(taxPaise),
    cgstRupees: fromPaise(cgstPaise),
    sgstRupees: fromPaise(sgstPaise),
    igstRupees: fromPaise(igstPaise),
    totalRupees: fromPaise(taxableAmountPaise + taxPaise),
  };
}

export function calculateFolio(
  lines: MoneyLine[],
  received: number[],
  reversed: number[],
  refunds: number[],
): FolioTotals {
  const sumMoney = (items: number[], field: string) =>
    items.reduce((total, value) => total + toPaise(value, field), 0);

  const lineSum = (select: (line: MoneyLine) => number) =>
    lines.reduce(
      (total, line) => total + toPaise(select(line), 'Folio line amount'),
      0,
    );

  const subtotalPaise = lineSum(line => line.subtotalRupees);
  const discountPaise = lineSum(line => line.discountRupees);
  const taxableAmountPaise = lineSum(line => line.taxableAmountRupees);
  const taxPaise = lineSum(line => line.taxRupees);
  const cgstPaise = lineSum(line => line.cgstRupees);
  const sgstPaise = lineSum(line => line.sgstRupees);
  const igstPaise = lineSum(line => line.igstRupees);
  const totalPaise = taxableAmountPaise + taxPaise;
  const paymentsPaise =
    sumMoney(received, 'Ledger amount') - sumMoney(reversed, 'Ledger amount');
  const refundsPaise = sumMoney(refunds, 'Ledger amount');

  return {
    grossChargesRupees: fromPaise(subtotalPaise),
    subtotalRupees: fromPaise(subtotalPaise),
    discountRupees: fromPaise(discountPaise),
    taxableAmountRupees: fromPaise(taxableAmountPaise),
    taxRupees: fromPaise(taxPaise),
    cgstRupees: fromPaise(cgstPaise),
    sgstRupees: fromPaise(sgstPaise),
    igstRupees: fromPaise(igstPaise),
    totalRupees: fromPaise(totalPaise),
    paymentsRupees: fromPaise(paymentsPaise),
    refundsRupees: fromPaise(refundsPaise),
    outstandingRupees: fromPaise(totalPaise - paymentsPaise + refundsPaise),
  };
}

export function financialYear(date: Date): string {
  const year = date.getUTCFullYear() - (date.getUTCMonth() < 3 ? 1 : 0);
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

export function roomChargeDates(
  arrivalDate: string,
  departureDate: string,
): string[] {
  const start = Date.parse(`${arrivalDate}T00:00:00Z`);
  const end = Date.parse(`${departureDate}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Stay dates are invalid.');
  }

  const dates: string[] = [];
  for (let at = start; at < end; at += 86400000) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }

  if (dates.length > 365) {
    throw new Error('Stay exceeds the posting limit.');
  }

  return dates;
}