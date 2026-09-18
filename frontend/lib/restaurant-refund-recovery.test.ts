import { describe, expect, it } from 'vitest';
import { clearRestaurantRefund, loadRestaurantRefund, saveRestaurantRefund } from './restaurant-refund-recovery';
const scope = { propertyId: 'property', userId: 'staff', orderId: 'order' };
const refund = { paymentId: 'payment-1', amountRupees: 200, reason: 'Cash returned', reference: 'cash-ref', idempotencyKey: 'original-refund-key' };
const storage = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
};
describe('restaurant refund recovery', () => {
  it('restores exact refund details and key across reloads until confirmed', () => {
    const store = storage(); saveRestaurantRefund(store, scope, refund);
    expect(loadRestaurantRefund(store, { ...scope })).toEqual(refund);
    clearRestaurantRefund(store, scope); expect(loadRestaurantRefund(store, scope)).toBeNull();
  });
  it.each(['propertyId', 'userId', 'orderId'])('isolates recovery by %s', field => {
    const store = storage(); saveRestaurantRefund(store, scope, refund);
    expect(loadRestaurantRefund(store, { ...scope, [field]: 'other' })).toBeNull();
  });
  it('preserves corrupt records and blocks a fresh refund', () => {
    const store = storage(); saveRestaurantRefund(store, scope, { ...refund, amountRupees: -0.01 });
    expect(() => loadRestaurantRefund(store, scope)).toThrow('Ask accounts');
    expect(() => loadRestaurantRefund(store, scope)).toThrow('Ask accounts');
  });
  it('fails before sending if storage cannot persist the key', () => {
    expect(() => saveRestaurantRefund({ ...storage(), setItem: () => { throw new Error('Storage denied'); } }, scope, refund)).toThrow('Storage denied');
  });
});
