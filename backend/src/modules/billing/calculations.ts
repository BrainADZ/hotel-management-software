import type { FolioTotals, MoneyLine, TaxMode } from './types';

function safeRupees(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be non-negative integer rupees.`);
  return value;
}
export function calculateLine(quantity: number, unitAmountRupees: number, discountRupees: number, taxRateBps: number, taxMode: TaxMode): MoneyLine {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Quantity must be a positive integer.');
  safeRupees(unitAmountRupees, 'Unit amount'); safeRupees(discountRupees, 'Discount');
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new Error('Tax rate is invalid.');
  const subtotalRupees = quantity * unitAmountRupees;
  if (!Number.isSafeInteger(subtotalRupees) || discountRupees > subtotalRupees) throw new Error('Discount exceeds the charge.');
  const taxableAmountRupees = subtotalRupees - discountRupees;
  const taxRupees = taxMode === 'EXEMPT' ? 0 : Math.round(taxableAmountRupees * taxRateBps / 10000);
  const cgstRupees = taxMode === 'CGST_SGST' ? Math.floor(taxRupees / 2) : 0;
  const sgstRupees = taxMode === 'CGST_SGST' ? taxRupees - cgstRupees : 0;
  const igstRupees = taxMode === 'IGST' ? taxRupees : 0;
  return { subtotalRupees, discountRupees, taxableAmountRupees, taxRupees, cgstRupees, sgstRupees, igstRupees, totalRupees: taxableAmountRupees + taxRupees };
}
export function calculateFolio(lines: MoneyLine[], received: number[], reversed: number[], refunds: number[]): FolioTotals {
  const sum = (items: number[]) => items.reduce((total, value) => total + safeRupees(value, 'Ledger amount'), 0);
  const lineSum = (select: (line: MoneyLine) => number) => lines.reduce((total, line) => total + select(line), 0);
  const subtotalRupees = lineSum(line => line.subtotalRupees);
  const discountRupees = lineSum(line => line.discountRupees);
  const taxableAmountRupees = lineSum(line => line.taxableAmountRupees);
  const taxRupees = lineSum(line => line.taxRupees);
  const cgstRupees = lineSum(line => line.cgstRupees);
  const sgstRupees = lineSum(line => line.sgstRupees);
  const igstRupees = lineSum(line => line.igstRupees);
  const totalRupees = taxableAmountRupees + taxRupees;
  const paymentsRupees = sum(received) - sum(reversed);
  const refundsRupees = sum(refunds);
  return { grossChargesRupees: subtotalRupees, subtotalRupees, discountRupees, taxableAmountRupees, taxRupees, cgstRupees, sgstRupees, igstRupees, totalRupees, paymentsRupees, refundsRupees, outstandingRupees: totalRupees - paymentsRupees + refundsRupees };
}
export function financialYear(date: Date): string {
  const year = date.getUTCFullYear() - (date.getUTCMonth() < 3 ? 1 : 0);
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}
export function roomChargeDates(arrivalDate: string, departureDate: string): string[] {
  const start = Date.parse(`${arrivalDate}T00:00:00Z`), end = Date.parse(`${departureDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Stay dates are invalid.');
  const dates: string[] = [];
  for (let at = start; at < end; at += 86400000) dates.push(new Date(at).toISOString().slice(0, 10));
  if (dates.length > 365) throw new Error('Stay exceeds the posting limit.');
  return dates;
}
