import { z } from 'zod';
import { DomainError } from '@hotel/shared/domain';
import { idempotencyKeySchema } from './validation';

export const restaurantPaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'UPI']),
  amountPaise: z.number().int().positive().max(1_000_000_000),
  reference: z.string().trim().max(100).optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

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
