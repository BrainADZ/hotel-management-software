import type { FolioTotals, MoneyLine, TaxMode } from './types';

function safePaise(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be non-negative integer paise.`);
  return value;
}
export function calculateLine(quantity: number, unitAmountPaise: number, discountPaise: number, taxRateBps: number, taxMode: TaxMode): MoneyLine {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Quantity must be a positive integer.');
  safePaise(unitAmountPaise, 'Unit amount'); safePaise(discountPaise, 'Discount');
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new Error('Tax rate is invalid.');
  const subtotalPaise = quantity * unitAmountPaise;
  if (!Number.isSafeInteger(subtotalPaise) || discountPaise > subtotalPaise) throw new Error('Discount exceeds the charge.');
  const taxableAmountPaise = subtotalPaise - discountPaise;
  const taxPaise = taxMode === 'EXEMPT' ? 0 : Math.round(taxableAmountPaise * taxRateBps / 10000);
  const cgstPaise = taxMode === 'CGST_SGST' ? Math.floor(taxPaise / 2) : 0;
  const sgstPaise = taxMode === 'CGST_SGST' ? taxPaise - cgstPaise : 0;
  const igstPaise = taxMode === 'IGST' ? taxPaise : 0;
  return { subtotalPaise, discountPaise, taxableAmountPaise, taxPaise, cgstPaise, sgstPaise, igstPaise, totalPaise: taxableAmountPaise + taxPaise };
}
export function calculateFolio(lines: MoneyLine[], received: number[], reversed: number[], refunds: number[]): FolioTotals {
  const sum = (items: number[]) => items.reduce((total, value) => total + safePaise(value, 'Ledger amount'), 0);
  const lineSum = (select: (line: MoneyLine) => number) => lines.reduce((total, line) => total + select(line), 0);
  const subtotalPaise = lineSum(line => line.subtotalPaise);
  const discountPaise = lineSum(line => line.discountPaise);
  const taxableAmountPaise = lineSum(line => line.taxableAmountPaise);
  const taxPaise = lineSum(line => line.taxPaise);
  const cgstPaise = lineSum(line => line.cgstPaise);
  const sgstPaise = lineSum(line => line.sgstPaise);
  const igstPaise = lineSum(line => line.igstPaise);
  const totalPaise = taxableAmountPaise + taxPaise;
  const paymentsPaise = sum(received) - sum(reversed);
  const refundsPaise = sum(refunds);
  return { grossChargesPaise: subtotalPaise, subtotalPaise, discountPaise, taxableAmountPaise, taxPaise, cgstPaise, sgstPaise, igstPaise, totalPaise, paymentsPaise, refundsPaise, outstandingPaise: totalPaise - paymentsPaise + refundsPaise };
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
