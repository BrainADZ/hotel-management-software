type PaymentScope = { orderId: string; propertyId: string; userId: string };
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function recoveryKey(scope: PaymentScope) {
  return `hotel:restaurant-payment:${JSON.stringify([scope.propertyId, scope.userId, scope.orderId])}`;
}

export function savePendingRestaurantPayment(storage: RecoveryStorage, scope: PaymentScope, body: string) {
  // Persist before sending. If storage is unavailable, do not risk a payment
  // whose idempotency key would disappear on reload.
  storage.setItem(recoveryKey(scope), body);
}

export function loadPendingRestaurantPayment(storage: RecoveryStorage, scope: PaymentScope): string | null {
  const body = storage.getItem(recoveryKey(scope));
  if (body === null) return null;
  try {
    const value = JSON.parse(body);
    if (!value || !['CASH', 'CARD', 'UPI'].includes(value.method) ||
        !Number.isSafeInteger(value.amountRupees) || value.amountRupees <= 0 || value.amountRupees > 1_000_000_000 ||
        typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(value.idempotencyKey) ||
        (value.reference !== undefined && (typeof value.reference !== 'string' || value.reference.length > 100)) ||
        Object.keys(value).some(key => !['method', 'amountRupees', 'reference', 'idempotencyKey'].includes(key))) {
      throw new Error('Invalid pending payment');
    }
    return body;
  } catch {
    // Preserve the record so an operator can investigate it; silently deleting
    // it could permit another payment after an uncertain first attempt.
    throw new Error('Saved payment details could not be recovered. Ask accounts to verify this order before taking another payment.');
  }
}

export function clearPendingRestaurantPayment(storage: RecoveryStorage, scope: PaymentScope) {
  storage.removeItem(recoveryKey(scope));
}
