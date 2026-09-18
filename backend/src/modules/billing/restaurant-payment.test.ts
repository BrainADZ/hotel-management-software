import { describe, expect, it } from 'vitest';
import { restaurantPaymentSchema, restaurantSettlement } from './restaurant-payment';

const payment = (method: 'CASH' | 'CARD' | 'UPI', amountRupees: number) =>
  restaurantPaymentSchema.parse({ method, amountRupees, idempotencyKey: 'operation-1234' });

describe('restaurant settlement amounts', () => {
  it('records cash change only against outstanding', () => {
    expect(restaurantSettlement(850, 0, payment('CASH', 1000))).toMatchObject({
      amountAppliedRupees: 850, changeDueRupees: 150, paidRupees: 850, paymentStatus: 'PAID',
    });
  });
  it('supports partial and split payments', () => {
    const first = restaurantSettlement(850, 0, payment('CARD', 300));
    expect(first).toMatchObject({ paidRupees: 300, outstandingRupees: 550, paymentStatus: 'PARTIALLY_PAID' });
    expect(restaurantSettlement(850, first.paidRupees, payment('UPI', 550))).toMatchObject({
      paidRupees: 850, outstandingRupees: 0, paymentStatus: 'PAID',
    });
  });
  it.each(['CARD', 'UPI'] as const)('rejects %s overpayment', (method) => {
    expect(() => restaurantSettlement(850, 0, payment(method, 850.01))).toThrow('exceeds');
  });
  it('rejects payments after settlement', () => {
    expect(() => restaurantSettlement(850, 850, payment('CASH', 0.01))).toThrow('already paid');
  });
});
