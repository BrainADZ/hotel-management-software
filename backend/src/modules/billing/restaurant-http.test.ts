import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { createApp } from '@/app';
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
function database(selects: unknown[][]) {
  const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; value: Record<string, unknown> }> = [];
  const db = {
    transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
    execute: vi.fn(async () => []),
    select: () => {
      if (!selects.length) throw new Error('Unexpected database query');
      const rows = selects.shift()!;
      const query = Object.assign(Promise.resolve(rows), {
        from: () => query, where: () => query, limit: () => query, for: () => query,
      });
      return query;
    },
    insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (value: Record<string, unknown>) => {
      const name = getTableName(table); writes.push({ table: name, value });
      const query = Object.assign(Promise.resolve(), {
        onConflictDoUpdate: () => query,
        returning: async () => name === 'financial_sequences' ? [{ nextValue: 2 }] : [{ ...payment, ...value }],
      });
      return query;
    } }),
    update: (table: Parameters<typeof getTableName>[0]) => ({ set: (value: Record<string, unknown>) => {
      updates.push({ table: getTableName(table), value });
      return { where: async () => [] };
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
  it.each(['reverse', 'refund'])('explicitly rejects restaurant %s without changing records', async action => {
    const db = database([[payment]]);
    const response = await request({ amountPaise: 100, reason: 'Requested correction', idempotencyKey: 'correction-123' }, `/api/payments/${payment.id}/${action}`);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('RESTAURANT_REVERSAL_UNSUPPORTED');
    expect(db.writes).toHaveLength(0); expect(db.updates).toHaveLength(0);
  });
  it('downloads a restaurant receipt through the shared PDF endpoint', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'RESTAURANT' } });
    database([[payment], [order], [profile], [{ newValue: JSON.stringify({ amountReceivedPaise: 100000 }) }]]);
    const response = await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.body.startsWith('%PDF-')).toBe(true);
  });
  it('denies a restaurant cashier access to a guest folio receipt', async () => {
    mocks.context.mockResolvedValue({ ...context, actor: { ...context.actor, role: 'RESTAURANT' } });
    database([[{ ...payment, restaurantOrderId: null, folioId: 'folio' }]]);
    expect((await request(undefined, `/api/payments/${payment.id}/receipt`, 'GET')).statusCode).toBe(403);
  });
});
