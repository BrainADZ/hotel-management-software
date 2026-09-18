import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { createApp } from '@/app';
import * as documents from './documents';
import type { ReservationContext } from '@/services/reservations/types';

const mocks = vi.hoisted(() => ({ db: vi.fn(), context: vi.fn() }));
vi.mock('@/db', () => ({ getDb: mocks.db }));
vi.mock('@/services/reservations/http', () => ({ requireReservationContext: mocks.context }));

const context: ReservationContext = {
  actor: { id: 'staff', name: 'Cashier', email: 'cashier@example.test', role: 'OWNER', organisationId: 'org', propertyId: 'property' },
  property: { id: 'property', organisationId: 'org', name: 'Hotel', code: 'HTL', timezone: 'Asia/Kolkata' },
};
const order = { id: 'order', propertyId: 'property', reservationId: null, paymentStatus: 'UNPAID', totalPaise: 85000, paidPaise: 0, orderType: 'TAKEAWAY', customerName: 'Asha' };
const payment = { id: '11111111-1111-4111-8111-111111111111', restaurantOrderId: 'order', folioId: null,
  reservationId: null, method: 'CASH', amountPaise: 85000, reference: null,
  status: 'RECEIVED', paymentNumber: 'RCT/2026-27/000001', receivedAt: '2026-09-17T10:00:00Z' };
const profile = { id: 'property', organisationId: 'org', name: 'Hotel', receiptPrefix: 'RCT' };
const input = { method: 'CASH', amountPaise: 100000, idempotencyKey: 'payment-request-1' };

// Exercise the real HTTP registry, route, validation, BillingService and PDF renderer.
// Database query results are controlled; these tests never connect to business data.
function database(selects: unknown[][], refundTotals: Array<{ paymentId: string; amountPaise: number }> = []) {
  const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; value: Record<string, unknown> }> = [];
  const db = {
    transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
    execute: vi.fn(async () => []),
    select: (projection?: unknown) => {
      if (!projection && !selects.length) throw new Error('Unexpected database query');
      const rows = projection ? refundTotals : selects.shift()!;
      const query = Object.assign(Promise.resolve(rows), {
        from: () => query, where: () => query, limit: () => query, for: () => query, orderBy: () => query,
      });
      return query;
    },
    insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (value: Record<string, unknown>) => {
      const name = getTableName(table); writes.push({ table: name, value });
      if (name === 'payment_refunds') refundTotals.push({ paymentId: String(value.paymentId), amountPaise: Number(value.amountPaise) });
      const query = Object.assign(Promise.resolve(), {
        onConflictDoUpdate: () => query,
        returning: async () => name === 'financial_sequences' ? [{ nextValue: 2 }] : [{ ...payment, ...value }],
      });
      return query;
    } }),
    update: (table: Parameters<typeof getTableName>[0]) => ({ set: (value: Record<string, unknown>) => {
      updates.push({ table: getTableName(table), value });
      return { where: () => Object.assign(Promise.resolve([]), { returning: async () => [{ ...payment, ...value }] }) };
    } }),
  };
  mocks.db.mockReturnValue(db);
  return { writes, updates };
}

async function request(payload: Record<string, unknown> | undefined, path = '/api/restaurant-orders/order/payments', method: 'POST' | 'GET' = 'POST') {
  const app = await createApp();
  try { return await app.inject({ method, url: path, ...(method === 'POST' ? { payload } : {}) }); }
  finally { await app.close(); }
}

beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue(context); });

describe('restaurant payment HTTP flow', () => {
  it('loads persisted payment history and balances without writing financial records', async () => {
    const card = { ...payment, id: 'card-payment', method: 'CARD', amountPaise: 30000, reference: 'card-ref', idempotencyKey: 'private-key' };
    const cash = { ...payment, amountPaise: 55000 };
    const db = database([[{ ...order, paidPaise: 0 }], [cash, card], [{ entityId: payment.id, newValue: JSON.stringify({ amountReceivedPaise: 60000 }) }]]);
    const response = await request(undefined, '/api/restaurant-orders/order/payments', 'GET');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.json()).toMatchObject({ paidPaise: 85000, outstandingPaise: 0, paymentStatus: 'PAID', payments: [
      { paymentId: payment.id, amountAppliedPaise: 55000, amountReceivedPaise: 60000, changeDuePaise: 5000, receiptAvailable: true },
      { paymentId: 'card-payment', reference: 'card-ref', amountReceivedPaise: 30000, changeDuePaise: 0 },
    ] });
    expect(response.body).not.toContain('private-key');
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it('excludes reversed payments from the balance but keeps them in history', async () => {
    database([[order], [{ ...payment, method: 'CARD', amountPaise: 20000 }, { ...payment, id: 'reversed', method: 'UPI', status: 'REVERSED' }], []]);
    const response = await request(undefined, '/api/restaurant-orders/order/payments', 'GET');
    expect(response.json()).toMatchObject({ paidPaise: 20000, outstandingPaise: 65000, paymentStatus: 'PARTIALLY_PAID' });
    expect(response.json().payments).toHaveLength(2);
  });
  it('shows missing cash tender as unavailable instead of fabricating a receipt', async () => {
    database([[order], [payment], []]);
    const response = await request(undefined, '/api/restaurant-orders/order/payments', 'GET');
    expect(response.json().payments[0]).toMatchObject({ amountReceivedPaise: null, changeDuePaise: null, receiptAvailable: false });
  });
  it('shows an unpaid order with an empty history', async () => {
    database([[order], []]);
    expect((await request(undefined, '/api/restaurant-orders/order/payments', 'GET')).json()).toMatchObject({ paidPaise: 0, outstandingPaise: 85000, paymentStatus: 'UNPAID', payments: [] });
  });
  it('preserves folio posting status in payment history', async () => {
    database([[{ ...order, reservationId: 'stay', paymentStatus: 'POSTED_TO_FOLIO' }], []]);
    expect((await request(undefined, '/api/restaurant-orders/order/payments', 'GET')).json()).toMatchObject({ outstandingPaise: null, paymentStatus: 'POSTED_TO_FOLIO' });
  });
  it.each(['RESTAURANT', 'ACCOUNTS'])('permits %s to read history', async role => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role } });
    database([[order], []]);
    expect((await request(undefined, '/api/restaurant-orders/order/payments', 'GET')).statusCode).toBe(200);
  });
  it('rejects unauthorized history access before accessing the database', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'HOUSEKEEPING' } });
    expect((await request(undefined, '/api/restaurant-orders/order/payments', 'GET')).statusCode).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('returns 404 when the order is absent in the selected property', async () => {
    database([[]]);
    expect((await request(undefined, '/api/restaurant-orders/missing/payments', 'GET')).statusCode).toBe(404);
  });
  it('records cash applied amount, issues shared receipt number, audits tender and does not write folios', async () => {
    const db = database([[order], [], [], [], [profile]]);
    const response = await request(input);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ amountAppliedPaise: 85000, amountReceivedPaise: 100000, changeDuePaise: 15000, paidPaise: 85000, outstandingPaise: 0, paymentStatus: 'PAID' });
    expect(db.writes.map(row => row.table)).toEqual(['financial_sequences', 'payments', 'audit_logs']);
    expect(db.writes[1].value).toMatchObject({ folioId: null, reservationId: null, restaurantOrderId: 'order', amountPaise: 85000 });
    expect(JSON.parse(String(db.writes[2].value.newValue))).toMatchObject({ amountReceivedPaise: 100000, changeDuePaise: 15000 });
    expect(db.updates[0].value).toMatchObject({ paidPaise: 85000, paymentStatus: 'PAID' });
  });
  it.each(['CARD', 'UPI'])('supports %s partial payments using active payment totals', async method => {
    database([[{ ...order, paidPaise: 123 }], [], [], [{ amountPaise: 20000 }], [profile]]);
    const response = await request({ ...input, method, amountPaise: 30000, reference: 'transaction-123' });
    expect(response.json()).toMatchObject({ paidPaise: 50000, outstandingPaise: 35000, paymentStatus: 'PARTIALLY_PAID', reference: 'transaction-123' });
  });
  it('replays the original cash receipt without writing another payment', async () => {
    const db = database([[{ ...order, paidPaise: 85000 }], [payment], [], [payment], [{ newValue: JSON.stringify({ amountReceivedPaise: 100000 }) }]]);
    const response = await request(input);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ paymentId: payment.id, changeDuePaise: 15000 });
    expect(db.writes).toHaveLength(0);
  });
  it('rejects changed cash tender on the same key even when applied amount would match', async () => {
    const db = database([[order], [payment], [], [payment], [{ newValue: JSON.stringify({ amountReceivedPaise: 100000 }) }]]);
    const response = await request({ ...input, amountPaise: 110000 });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(db.writes).toHaveLength(0);
  });
  it('does not accept direct settlement for folio-linked orders', async () => {
    const db = database([[{ ...order, reservationId: 'stay', paymentStatus: 'POSTED_TO_FOLIO' }]]);
    expect((await request(input)).json().error.code).toBe('ORDER_POSTED_TO_FOLIO');
    expect(db.writes).toHaveLength(0);
  });
  it('replays an earlier partial payment after another payment settles the bill', async () => {
    const partial = { ...payment, amountPaise: 30000, method: 'CARD' };
    const db = database([[{ ...order, paidPaise: 85000 }], [partial], [], [partial, { amountPaise: 55000 }], []]);
    const response = await request({ ...input, method: 'CARD', amountPaise: 30000 });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ amountAppliedPaise: 30000, paidPaise: 85000, outstandingPaise: 0 });
    expect(db.writes).toHaveLength(0);
  });
  it.each(['CARD', 'UPI'])('rejects %s overpayment before allocating a receipt', async method => {
    const db = database([[order], [], [], []]);
    const response = await request({ ...input, method });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('PAYMENT_EXCEEDS_OUTSTANDING');
    expect(db.writes).toHaveLength(0);
  });
  it('does not invent tender when historical cash audit data is missing', async () => {
    const db = database([[order], [payment], [], [payment], []]);
    const response = await request(input);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('PAYMENT_TENDER_UNAVAILABLE');
    expect(db.writes).toHaveLength(0);
  });
  it('denies unauthorized roles before accessing payment data', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'HOUSEKEEPING' } });
    const response = await request(input);
    expect(response.statusCode).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects another payment on a fully paid order', async () => {
    const db = database([[order], [], [], [payment]]);
    expect((await request(input)).json().error.code).toBe('ORDER_ALREADY_PAID');
    expect(db.writes).toHaveLength(0);
  });
  it.each([25000, 85000])('records restaurant refund %s and recalculates net balance', async amountPaise => {
    const db = database([[payment], [order], [], [], [payment]]);
    const response = await request({ amountPaise, reason: 'Customer money returned', reference: 'refund-ref', idempotencyKey: 'refund-key-123' }, `/api/payments/${payment.id}/refund`);
    expect(response.statusCode).toBe(201);
    expect(db.writes[0]).toMatchObject({ table: 'payment_refunds', value: { paymentId: payment.id, folioId: null, amountPaise, reference: 'refund-ref' } });
    expect(db.writes[1]).toMatchObject({ table: 'audit_logs', value: { action: 'REFUND_RECORDED' } });
    expect(db.updates).toEqual([{ table: 'restaurant_orders', value: { paidPaise: 85000 - amountPaise, paymentStatus: amountPaise === 85000 ? 'UNPAID' : 'PARTIALLY_PAID', settledAt: null } }]);
  });
  it('replays an identical refund without further writes', async () => {
    const refund = { amountPaise: 20000, reason: 'Cash returned', reference: 'cash', idempotencyKey: 'refund-key-123' };
    const db = database([[payment], [order], [refund]]);
    expect((await request(refund, `/api/payments/${payment.id}/refund`)).statusCode).toBe(201);
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it.each(['amountPaise', 'reason', 'reference'])('rejects changed refund replay %s', async field => {
    const refund = { amountPaise: 20000, reason: 'Cash returned', reference: 'cash', idempotencyKey: 'refund-key-123' };
    const db = database([[payment], [order], [refund]]);
    const response = await request({ ...refund, [field]: field === 'amountPaise' ? 30000 : 'Different value' }, `/api/payments/${payment.id}/refund`);
    expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(db.writes).toHaveLength(0);
  });
  it.each([
    { rows: [[payment], [order], [], [{ amountPaise: 84000 }]], code: 'REFUND_EXCEEDS_PAYMENT' },
    { rows: [[{ ...payment, status: 'REVERSED' }], [order]], code: 'PAYMENT_NOT_REFUNDABLE' },
    { rows: [[payment], [{ ...order, reservationId: 'guest' }]], code: 'ORDER_POSTED_TO_FOLIO' },
  ])('blocks unsafe refund: $code', async ({ rows, code }) => {
    const db = database(rows);
    const response = await request({ amountPaise: 2000, reason: 'Cash returned', idempotencyKey: 'refund-key-123' }, `/api/payments/${payment.id}/refund`);
    expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe(code);
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it('blocks refund by restaurant staff before accessing data', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'RESTAURANT' } });
    expect((await request({ amountPaise: 2000, reason: 'Cash returned', idempotencyKey: 'refund-key-123' }, `/api/payments/${payment.id}/refund`)).statusCode).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('shows refunded totals and remaining refundable amount in history', async () => {
    database([[order], [{ ...payment, method: 'CARD' }], []], [{ paymentId: payment.id, amountPaise: 20000 }]);
    const response = await request(undefined, '/api/restaurant-orders/order/payments', 'GET');
    expect(response.json()).toMatchObject({ paidPaise: 65000, outstandingPaise: 20000, payments: [{ refundedPaise: 20000, refundablePaise: 65000 }] });
  });
  it('renders refund and net totals on the original receipt', async () => {
    const renderer = vi.spyOn(documents, 'premiumPaymentReceiptPdf');
    try {
      database([[payment], [order], [profile], [{ newValue: JSON.stringify({ amountReceivedPaise: 100000 }) }]],
        [{ paymentId: payment.id, amountPaise: 20000 }]);
      const response = await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET');
      expect(response.statusCode).toBe(200);
      expect(renderer).toHaveBeenCalledWith(expect.objectContaining({
        receipt: expect.objectContaining({ number: payment.paymentNumber }),
        amounts: { receivedPaise: 85000, refundedPaise: 20000, netPaise: 65000 },
      }));
    } finally { renderer.mockRestore(); }
  });
  it.each([0, -1, 1.5])('rejects invalid refund amount %s before database access', async amountPaise => {
    expect((await request({ amountPaise, reason: 'Cash returned', idempotencyKey: 'refund-key-123' }, `/api/payments/${payment.id}/refund`)).statusCode).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('returns 404 for a payment outside the selected scope without writing', async () => {
    const db = database([[]]);
    expect((await request({ amountPaise: 100, reason: 'Cash returned', idempotencyKey: 'refund-key-123' }, `/api/payments/${payment.id}/refund`)).statusCode).toBe(404);
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it('accepts a replacement payment against the refunded balance', async () => {
    const db = database([[order], [], [], [payment], [profile]], [{ paymentId: payment.id, amountPaise: 20000 }]);
    const response = await request({ method: 'CARD', amountPaise: 20000, idempotencyKey: 'replacement-key' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ paidPaise: 85000, outstandingPaise: 0, paymentStatus: 'PAID' });
    expect(db.writes.filter(row => row.table === 'payments')).toHaveLength(1);
  });
  it('preserves refunds on other payments when reversing a mistaken entry', async () => {
    const other = { ...payment, id: 'other', amountPaise: 20000 };
    const db = database([[payment], [order], [], [payment, other]], [{ paymentId: 'other', amountPaise: 5000 }]);
    expect((await request({ reason: 'Incorrect entry' }, `/api/payments/${payment.id}/reverse`)).statusCode).toBe(200);
    expect(db.updates[1].value).toMatchObject({ paidPaise: 15000, paymentStatus: 'PARTIALLY_PAID' });
  });
  it.each([0, 20000])('reverses a mistaken payment and recalculates remaining paid amount %s', async remaining => {
    const db = database([[payment], [order], [], [payment, ...(remaining ? [{ ...payment, id: 'other', amountPaise: remaining }] : [])]]);
    const response = await request({ reason: 'Incorrect cash entry' }, `/api/payments/${payment.id}/reverse`);
    expect(response.statusCode).toBe(200);
    expect(db.updates).toEqual([
      { table: 'payments', value: expect.objectContaining({ status: 'REVERSED', reversalReason: 'Incorrect cash entry', reversedBy: 'staff' }) },
      { table: 'restaurant_orders', value: { paidPaise: remaining, paymentStatus: remaining ? 'PARTIALLY_PAID' : 'UNPAID', settledAt: null } },
    ]);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({ table: 'audit_logs', value: { action: 'PAYMENT_REVERSED', entityId: payment.id } });
  });
  it('retries a completed reversal without more writes', async () => {
    const db = database([[{ ...payment, status: 'REVERSED' }], [order]]);
    expect((await request({ reason: 'Incorrect entry' }, `/api/payments/${payment.id}/reverse`)).statusCode).toBe(200);
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it.each([
    { rows: [[], [], []], code: 'PAYMENT_NOT_FOUND', status: 404 },
    { rows: [[payment], [], []], code: 'ORDER_NOT_FOUND', status: 404 },
    { rows: [[payment], [{ ...order, reservationId: 'guest' }], []], code: 'ORDER_POSTED_TO_FOLIO', status: 409 },
    { rows: [[payment], [order], [{ amountPaise: 100 }]], code: 'PAYMENT_HAS_REFUNDS', status: 409 },
  ])('rejects unsafe reversal: $code', async ({ rows, code, status }) => {
    const db = database(rows);
    const response = await request({ reason: 'Incorrect entry' }, `/api/payments/${payment.id}/reverse`);
    expect(response.statusCode).toBe(status); expect(response.json().error.code).toBe(code);
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it('rejects restaurant staff reversal before database access', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'RESTAURANT' } });
    expect((await request({ reason: 'Incorrect entry' }, `/api/payments/${payment.id}/reverse`)).statusCode).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('requires a meaningful reversal reason', async () => {
    const response = await request({ reason: '' }, `/api/payments/${payment.id}/reverse`);
    expect(response.statusCode).toBe(400); expect(mocks.db).not.toHaveBeenCalled();
  });
  it('downloads a restaurant receipt through the shared PDF endpoint', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'RESTAURANT' } });
    database([[payment], [order], [profile], [{ newValue: JSON.stringify({ amountReceivedPaise: 100000 }) }]]);
    const response = await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.body.startsWith('%PDF-')).toBe(true);
  });
  it('reprints the same persisted receipt without a new payment or receipt number', async () => {
    const receiptRows = [[payment], [order], [profile], [{ newValue: JSON.stringify({ amountReceivedPaise: 100000 }) }]];
    const db = database([...receiptRows, ...receiptRows]);
    const first = await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET');
    const second = await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET');
    expect(second.statusCode).toBe(200);
    expect(second.headers['content-disposition']).toBe(first.headers['content-disposition']);
    expect(second.body).toBe(first.body);
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it('denies a restaurant cashier access to a guest folio receipt', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'RESTAURANT' } });
    database([[{ ...payment, restaurantOrderId: null, folioId: 'folio' }]]);
    expect((await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET')).statusCode).toBe(403);
  });
});
