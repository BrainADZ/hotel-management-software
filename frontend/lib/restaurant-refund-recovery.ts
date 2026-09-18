type Scope = { orderId: string; propertyId: string; userId: string };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PendingRestaurantRefund = { paymentId: string; amountPaise: number; reason: string; reference?: string; idempotencyKey: string };
const key = (scope: Scope) => `hotel:restaurant-refund:${JSON.stringify([scope.propertyId, scope.userId, scope.orderId])}`;
export function saveRestaurantRefund(store: Store, scope: Scope, value: PendingRestaurantRefund) {
  store.setItem(key(scope), JSON.stringify(value));
}
export function clearRestaurantRefund(store: Store, scope: Scope) { store.removeItem(key(scope)); }
export function loadRestaurantRefund(store: Store, scope: Scope): PendingRestaurantRefund | null {
  const raw = store.getItem(key(scope));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.paymentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value.paymentId) ||
        !Number.isSafeInteger(value.amountPaise) || value.amountPaise <= 0 || value.amountPaise > 10_000_000_000 ||
        typeof value.reason !== 'string' || value.reason.trim().length < 3 || value.reason.length > 500 ||
        typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(value.idempotencyKey) ||
        (value.reference !== undefined && (typeof value.reference !== 'string' || value.reference.length > 100)) ||
        Object.keys(value).some(field => !['paymentId', 'amountPaise', 'reason', 'reference', 'idempotencyKey'].includes(field))) throw new Error();
    return value;
  } catch { throw new Error('Saved refund could not be recovered. Ask accounts to verify this order before recording more payments or refunds.'); }
}
