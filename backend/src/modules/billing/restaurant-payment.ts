import { z } from 'zod';
import { DomainError } from '@hotel/shared/domain';
import { idempotencyKeySchema } from './validation';

export const restaurantPaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'UPI']),
  amountPaise: z.number().int().positive().max(1_000_000_000),
  reference: z.string().trim().max(100).optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

// Cash tender is recorded by the existing PAYMENT_RECEIVED audit entry.
// Never reconstruct the original tender from a later retry or order balance.
export function restaurantTender(payment: { amountPaise: number; method: string }, auditValue?: string | null) {
  let value: unknown;
  try { value = JSON.parse(auditValue ?? '{}'); } catch { value = null; }
  const received = value && typeof value === 'object' && 'amountReceivedPaise' in value
    ? value.amountReceivedPaise : undefined;
  if (typeof received === 'number' && Number.isSafeInteger(received) && received >= payment.amountPaise) {
    return received;
  }
  if (payment.method !== 'CASH') return payment.amountPaise;
  throw new DomainError('PAYMENT_TENDER_UNAVAILABLE', 'The original cash receipt details are unavailable. Contact accounts before retrying.', 409);
}

export function assertRestaurantPaymentReplay(
  payment: { method: string; reference: string | null; amountPaise: number },
  receivedPaise: number,
  input: z.infer<typeof restaurantPaymentSchema>,
) {
  if (payment.method !== input.method || (payment.reference ?? '') !== (input.reference ?? '') || receivedPaise !== input.amountPaise) {
    throw new DomainError('IDEMPOTENCY_CONFLICT', 'This payment key was used with different details.', 409);
  }
}

export function requireFolioPayment(payment: { folioId: string | null }): asserts payment is { folioId: string } {
  if (!payment.folioId) {
    throw new DomainError('PAYMENT_SOURCE_INVALID', 'This operation requires a valid payment source. No payment was changed.', 409);
  }
}

export function restaurantSettlement(totalPaise: number, paidPaise: number,
  input: z.infer<typeof restaurantPaymentSchema>) {
  const outstandingPaise = totalPaise - paidPaise;
  if (outstandingPaise <= 0) {
    throw new DomainError('ORDER_ALREADY_PAID', 'The restaurant order is already paid.', 409);
  }
  if (input.method !== 'CASH' && input.amountPaise > outstandingPaise) {
    throw new DomainError('PAYMENT_EXCEEDS_OUTSTANDING', 'Payment exceeds the outstanding amount.', 409);
  }
  const amountAppliedPaise = Math.min(input.amountPaise, outstandingPaise);
  const nextPaidPaise = paidPaise + amountAppliedPaise;
  return { amountAppliedPaise, changeDuePaise: input.amountPaise - amountAppliedPaise,
    paidPaise: nextPaidPaise, outstandingPaise: totalPaise - nextPaidPaise,
    paymentStatus: nextPaidPaise >= totalPaise ? 'PAID' : 'PARTIALLY_PAID' };
}
