import { describe, expect, it } from 'vitest';
import { restaurantPaymentSchema, restaurantSettlement } from './restaurant-payment';

const payment = (method: 'CASH' | 'CARD' | 'UPI', amountPaise: number) =>
  restaurantPaymentSchema.parse({ method, amountPaise, idempotencyKey: 'operation-1234' });

describe('restaurant settlement amounts', () => {
  it('records cash change only against outstanding', () => {
    expect(restaurantSettlement(85000, 0, payment('CASH', 100000))).toMatchObject({
      amountAppliedPaise: 85000, changeDuePaise: 15000, paidPaise: 85000, paymentStatus: 'PAID',
    });
  });
  it('supports partial and split payments', () => {
    const first = restaurantSettlement(85000, 0, payment('CARD', 30000));
    expect(first).toMatchObject({ paidPaise: 30000, outstandingPaise: 55000, paymentStatus: 'PARTIALLY_PAID' });
    expect(restaurantSettlement(85000, first.paidPaise, payment('UPI', 55000))).toMatchObject({
      paidPaise: 85000, outstandingPaise: 0, paymentStatus: 'PAID',
    });
  });
  it.each(['CARD', 'UPI'] as const)('rejects %s overpayment', (method) => {
    expect(() => restaurantSettlement(85000, 0, payment(method, 85001))).toThrow('exceeds');
  });
  it('rejects payments after settlement', () => {
    expect(() => restaurantSettlement(85000, 85000, payment('CASH', 1))).toThrow('already paid');
  });
});
