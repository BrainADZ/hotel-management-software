import { z } from 'zod';
import { DomainError } from '@hotel/shared/domain';
import { idempotencyKeySchema } from './validation';

export const restaurantPaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'UPI']),
  amountRupees: z.number().multipleOf(0.01).positive().max(10000000),
  reference: z.string().trim().max(100).optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

// Cash tender is recorded by the existing PAYMENT_RECEIVED audit entry.
// Never reconstruct the original tender from a later retry or order balance.
export function restaurantTender(payment: { amountRupees: number; method: string }, auditValue?: string | null) {
  let value: unknown;
  try { value = JSON.parse(auditValue ?? '{}'); } catch { value = null; }
  const received = value && typeof value === 'object' && 'amountReceivedRupees' in value
    ? value.amountReceivedRupees : undefined;
  if (typeof received === 'number' && Number.isSafeInteger(received) && received >= payment.amountRupees) {
    return received;
  }
  if (payment.method !== 'CASH') return payment.amountRupees;
  throw new DomainError('PAYMENT_TENDER_UNAVAILABLE', 'The original cash receipt details are unavailable. Contact accounts before retrying.', 409);
}

export function assertRestaurantPaymentReplay(
  payment: { method: string; reference: string | null; amountRupees: number },
  receivedRupees: number,
  input: z.infer<typeof restaurantPaymentSchema>,
) {
  if (payment.method !== input.method || (payment.reference ?? '') !== (input.reference ?? '') || receivedRupees !== input.amountRupees) {
    throw new DomainError('IDEMPOTENCY_CONFLICT', 'This payment key was used with different details.', 409);
  }
}

export function requireFolioPayment(payment: { folioId: string | null }): asserts payment is { folioId: string } {
  if (!payment.folioId) {
    throw new DomainError('PAYMENT_SOURCE_INVALID', 'This operation requires a valid payment source. No payment was changed.', 409);
  }
}

export function restaurantSettlement(totalRupees: number, paidRupees: number,
  input: z.infer<typeof restaurantPaymentSchema>) {
  const outstandingRupees = totalRupees - paidRupees;
  if (outstandingRupees <= 0) {
    throw new DomainError('ORDER_ALREADY_PAID', 'The restaurant order is already paid.', 409);
  }
  if (input.method !== 'CASH' && input.amountRupees > outstandingRupees) {
    throw new DomainError('PAYMENT_EXCEEDS_OUTSTANDING', 'Payment exceeds the outstanding amount.', 409);
  }
  const amountAppliedRupees = Math.min(input.amountRupees, outstandingRupees);
  const nextPaidRupees = paidRupees + amountAppliedRupees;
  return { amountAppliedRupees, changeDueRupees: input.amountRupees - amountAppliedRupees,
    paidRupees: nextPaidRupees, outstandingRupees: totalRupees - nextPaidRupees,
    paymentStatus: nextPaidRupees >= totalRupees ? 'PAID' : 'PARTIALLY_PAID' };
}
