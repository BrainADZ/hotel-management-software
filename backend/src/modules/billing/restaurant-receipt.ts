import { and, eq } from 'drizzle-orm';
import { DomainError, roleCan } from '@hotel/shared/domain';
import { getDb } from '@/db';
import { auditLogs, paymentRefunds, payments, properties, restaurantOrders } from '@/db/schema';
import type { ReservationContext } from '@/services/reservations/types';
import { premiumPaymentReceiptPdf } from './documents';
import { restaurantTender } from './restaurant-payment';

export async function restaurantReceipt(context: ReservationContext, paymentId: string): Promise<Response | null> {
  if (!roleCan(context.actor.role, 'restaurant.manage') && !roleCan(context.actor.role, 'billing.view')) {
    throw new DomainError('FORBIDDEN', 'You cannot view payment receipts.', 403);
  }
  const db = getDb();
  const [payment] = await db.select().from(payments).where(and(
    eq(payments.id, paymentId), eq(payments.organisationId, context.actor.organisationId),
    eq(payments.propertyId, context.property.id),
  )).limit(1);
  if (!payment?.restaurantOrderId) return null;
  const [order] = await db.select().from(restaurantOrders).where(and(
    eq(restaurantOrders.id, payment.restaurantOrderId), eq(restaurantOrders.propertyId, context.property.id),
  )).limit(1);
  const [profile] = await db.select().from(properties).where(and(
    eq(properties.id, context.property.id), eq(properties.organisationId, context.actor.organisationId),
  )).limit(1);
  const [audit] = await db.select().from(auditLogs).where(and(
    eq(auditLogs.entityId, payment.id), eq(auditLogs.entity, 'PAYMENT'),
    eq(auditLogs.action, 'PAYMENT_RECEIVED'), eq(auditLogs.propertyId, context.property.id),
  )).limit(1);
  if (!order || !profile) throw new DomainError('RECEIPT_NOT_FOUND', 'Receipt details were not found.', 404);
  const tender = restaurantTender(payment, audit?.newValue);
  const refunds = await db.select({ paymentId: paymentRefunds.paymentId, amountRupees: paymentRefunds.amountRupees }).from(paymentRefunds).where(and(
    eq(paymentRefunds.paymentId, payment.id), eq(paymentRefunds.propertyId, context.property.id),
    eq(paymentRefunds.organisationId, context.actor.organisationId), eq(paymentRefunds.status, 'RECORDED'),
  ));
  const refundedRupees = refunds.reduce((sum, row) => sum + row.amountRupees, 0);
  const rupees = (value: number) => `₹${value.toFixed(2)}`;
  const pdf = premiumPaymentReceiptPdf({
    source: 'RESTAURANT',
    property: { name: profile.legalName || profile.name, address: profile.billingAddress, gstin: profile.gstin },
    receipt: { number: payment.paymentNumber, status: payment.status, receivedAt: payment.receivedAt,
      method: payment.method, reference: payment.reference,
      notes: `Tender ${rupees(tender)}; change ${rupees(tender - payment.amountRupees)}` },
    guest: { name: order.customerName || 'Walk-in customer', reservation: order.id, room: order.orderType },
    amounts: { receivedRupees: payment.amountRupees, refundedRupees, netRupees: payment.status === 'RECEIVED' ? payment.amountRupees - refundedRupees : 0 },
    reversal: payment.reversedAt ? { reversedAt: payment.reversedAt, reason: payment.reversalReason } : null,
  });
  return new Response(Buffer.from(pdf), { headers: {
    'Content-Type': 'application/pdf', 'Cache-Control': 'no-store, private',
    'Content-Disposition': `attachment; filename="Receipt-${payment.paymentNumber.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf"`,
  } });
}
