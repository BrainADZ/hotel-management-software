import { describe, expect, it } from 'vitest';
import { clearPendingRestaurantPayment, loadPendingRestaurantPayment, savePendingRestaurantPayment } from './restaurant-payment-recovery';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const scope = { orderId: 'order-1', propertyId: 'property-1', userId: 'cashier-1' };
const body = JSON.stringify({ method: 'CASH', amountPaise: 100000, reference: 'counter-1', idempotencyKey: 'same-payment-key' });

describe('restaurant payment recovery', () => {
  it('restores the exact request and key after a component reload', () => {
    const store = storage();
    savePendingRestaurantPayment(store, scope, body);
    expect(loadPendingRestaurantPayment(store, { ...scope })).toBe(body);
    expect(loadPendingRestaurantPayment(store, scope)).toBe(body);
  });
  it.each(['orderId', 'propertyId', 'userId'] as const)('isolates pending payments by %s', field => {
    const store = storage(); savePendingRestaurantPayment(store, scope, body);
    expect(loadPendingRestaurantPayment(store, { ...scope, [field]: 'another' })).toBeNull();
    expect(loadPendingRestaurantPayment(store, scope)).toBe(body);
  });
  it('clears a confirmed request so the next partial payment uses a new key', () => {
    const store = storage(); savePendingRestaurantPayment(store, scope, body);
    clearPendingRestaurantPayment(store, scope);
    expect(loadPendingRestaurantPayment(store, scope)).toBeNull();
    const next = JSON.stringify({ method: 'UPI', amountPaise: 20000, idempotencyKey: 'next-payment-key' });
    savePendingRestaurantPayment(store, scope, next);
    expect(loadPendingRestaurantPayment(store, scope)).toBe(next);
  });
  it('blocks corrupted recovery data instead of silently discarding it', () => {
    const store = storage(); savePendingRestaurantPayment(store, scope, '{broken');
    expect(() => loadPendingRestaurantPayment(store, scope)).toThrow('Ask accounts');
    expect(() => loadPendingRestaurantPayment(store, scope)).toThrow('Ask accounts');
  });
  it('rejects unsupported sensitive fields in a restored request', () => {
    const store = storage();
    savePendingRestaurantPayment(store, scope, JSON.stringify({ ...JSON.parse(body), cardNumber: 'do-not-store' }));
    expect(() => loadPendingRestaurantPayment(store, scope)).toThrow('could not be recovered');
  });
  it('surfaces storage errors before a request can be sent', () => {
    const store = { ...storage(), setItem: () => { throw new Error('Storage unavailable'); } };
    expect(() => savePendingRestaurantPayment(store, scope, body)).toThrow('Storage unavailable');
  });
});
