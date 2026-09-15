import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  auditLogs,
  damageReports,
  financialSequences,
  folioLines,
  folios,
  guests,
  housekeepingTasks,
  invoices,
  paymentRefunds,
  payments,
  properties,
  reservationEvents,
  reservations,
  rooms,
  stays,
} from '@/db/schema';

import { getDb } from '@/db';

import {
  assertRoleCan,
  DomainError,
  roleCan,
} from '@hotel/shared/domain';

import type {
  ReservationContext,
} from '@/services/reservations/types';

import {
  calculateFolio,
  calculateLine,
  financialYear,
  roomChargeDates,
} from './calculations';

import {
  checkoutSchema,
  discountSchema,
  invoiceCancelSchema,
  manualChargeSchema,
  paymentSchema,
  refundSchema,
  reversalSchema,
} from './validation';

import type {
  TaxMode,
} from './types';

type Db = ReturnType<typeof getDb>;

type Tx =
  Parameters<
    Parameters<
      Db['transaction']
    >[0]
  >[0];

const now = () =>
  new Date().toISOString();

function propertyDocumentCode(
  value: string | null | undefined,
) {
  const clean = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return clean || 'HTL';
}

function scope(
  c: ReservationContext,
) {
  if (
    c.actor.organisationId !==
      c.property.organisationId ||
    c.actor.propertyId !==
      c.property.id
  ) {
    throw new DomainError(
      'PROPERTY_ACCESS_DENIED',
      'An active property context is required.',
      403,
    );
  }
}

async function lock(
  tx: Tx,
  key: string,
) {
  await tx.execute(
    sql`
      select pg_advisory_xact_lock(
        hashtext(${key})
      )
    `,
  );
}

async function audit(
  tx: Tx,
  c: ReservationContext,
  action: string,
  entity: string,
  entityId: string,
  value: unknown,
) {
  const timestamp = now();

  await tx
    .insert(auditLogs)
    .values({
      id: crypto.randomUUID(),
      timestamp,
      actorId: c.actor.id,
      actorName: c.actor.name,
      role: c.actor.role,
      propertyId: c.property.id,
      deviceId: null,
      action,
      entity,
      entityId,
      previousValue: null,
      newValue:
        JSON.stringify(value),
      source: 'PRODUCTION_API',
      correlationId:
        crypto.randomUUID(),
    });

  if (
    entity === 'RESERVATION' &&
    action ===
      'CHECKOUT_INSPECTION_REQUESTED'
  ) {
    await tx
      .insert(
        reservationEvents,
      )
      .values({
        id: crypto.randomUUID(),
        organisationId:
          c.actor.organisationId,
        propertyId:
          c.property.id,
        reservationId:
          entityId,
        eventType:
          'CHECKED_OUT',
        previousStatus:
          'CHECKED_IN',
        newStatus:
          'CHECKED_OUT',
        performedBy:
          c.actor.id,
        metadata:
          value as Record<
            string,
            unknown
          >,
        createdAt:
          timestamp,
      });
  }
}

async function propertyProfile(
  tx: Tx,
  c: ReservationContext,
) {
  const [profile] =
    await tx
      .select()
      .from(properties)
      .where(
        and(
          eq(
            properties.id,
            c.property.id,
          ),
          eq(
            properties.organisationId,
            c.actor.organisationId,
          ),
        ),
      )
      .limit(1);

  if (!profile) {
    throw new DomainError(
      'PROPERTY_ACCESS_DENIED',
      'Property was not found.',
      403,
    );
  }

  return profile;
}

async function scopedFolio(
  tx: Tx,
  c: ReservationContext,
  id: string,
) {
  const [folio] =
    await tx
      .select()
      .from(folios)
      .where(
        and(
          eq(
            folios.id,
            id,
          ),
          eq(
            folios.organisationId,
            c.actor.organisationId,
          ),
          eq(
            folios.propertyId,
            c.property.id,
          ),
        ),
      )
      .limit(1);

  if (!folio) {
    throw new DomainError(
      'FOLIO_NOT_FOUND',
      'Folio was not found.',
      404,
    );
  }

  return folio;
}

async function ensureOpen(
  folio: {
    status: string;
  },
) {
  if (
    [
      'CLOSED',
      'VOID',
      'PENDING_INSPECTION',
      'PENDING_DAMAGE_REVIEW',
      'CHECKOUT_READY',
    ].includes(folio.status)
  ) {
    throw new DomainError(
      'FOLIO_CHARGES_LOCKED',
      'Charges, discounts and room rent are locked once checkout inspection begins.',
      409,
    );
  }
}

function ensureSettlementAllowed(
  folio: {
    status: string;
  },
) {
  if (folio.status === 'VOID') {
    throw new DomainError(
      'FOLIO_VOID',
      'Settlement is unavailable for a void folio.',
      409,
    );
  }
}

async function nextNumber(
  tx: Tx,
  propertyId: string,
  date: Date,
  type:
    | 'FOLIO'
    | 'INVOICE'
    | 'RECEIPT',
  prefix: string,
) {
  const fy =
    financialYear(date);

  const [sequence] =
    await tx
      .insert(
        financialSequences,
      )
      .values({
        propertyId,
        financialYear:
          fy,
        sequenceType:
          type,
        nextValue:
          2,
      })
      .onConflictDoUpdate({
        target: [
          financialSequences.propertyId,
          financialSequences.financialYear,
          financialSequences.sequenceType,
        ],
        set: {
          nextValue:
            sql`
              ${financialSequences.nextValue} + 1
            `,
        },
      })
      .returning({
        nextValue:
          financialSequences.nextValue,
      });

  return {
    number:
      `${prefix}/${fy}/${String(
        sequence.nextValue - 1,
      ).padStart(6, '0')}`,

    financialYear:
      fy,
  };
}

/**
 * Recalculate monetary totals for a folio.
 *
 * IMPORTANT:
 * OPEN / SETTLED are balance-derived states.
 * CLOSED / VOID are lifecycle states.
 *
 * Refunds and reversals after checkout may
 * change monetary totals but must never
 * silently reopen a CLOSED folio.
 */
async function recalculate(
  tx: Tx,
  c: ReservationContext,
  folioId: string,
) {
  const current =
    await scopedFolio(
      tx,
      c,
      folioId,
    );

  const lines =
    await tx
      .select()
      .from(folioLines)
      .where(
        and(
          eq(
            folioLines.folioId,
            folioId,
          ),
          eq(
            folioLines.organisationId,
            c.actor.organisationId,
          ),
          eq(
            folioLines.propertyId,
            c.property.id,
          ),
          isNull(
            folioLines.voidedAt,
          ),
        ),
      );

  const ledger =
    await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(
            payments.folioId,
            folioId,
          ),
          eq(
            payments.organisationId,
            c.actor.organisationId,
          ),
          eq(
            payments.propertyId,
            c.property.id,
          ),
        ),
      );

  const refunds =
    await tx
      .select()
      .from(
        paymentRefunds,
      )
      .where(
        and(
          eq(
            paymentRefunds.folioId,
            folioId,
          ),
          eq(
            paymentRefunds.organisationId,
            c.actor.organisationId,
          ),
          eq(
            paymentRefunds.propertyId,
            c.property.id,
          ),
        ),
      );

  const totals =
    calculateFolio(
      lines.map(
        (line) => ({
          ...line,
          totalPaise:
            line.lineTotalPaise,
        }),
      ),

      ledger.map(
        (payment) =>
          payment.amountPaise,
      ),

      ledger
        .filter(
          (payment) =>
            payment.status ===
            'REVERSED',
        )
        .map(
          (payment) =>
            payment.amountPaise,
        ),

      refunds
        .filter(
          (refund) =>
            refund.status ===
            'RECORDED',
        )
        .map(
          (refund) =>
            refund.amountPaise,
        ),
    );

  const lifecycleStatuses = [
    'CLOSED',
    'VOID',
    'PENDING_INSPECTION',
    'PENDING_DAMAGE_REVIEW',
    'CHECKOUT_READY',
  ];

  const nextStatus =
    lifecycleStatuses.includes(
      current.status,
    )
      ? current.status
      : totals.outstandingPaise <=
          0
        ? 'SETTLED'
        : 'OPEN';

  await tx
    .update(folios)
    .set({
      subtotalPaise:
        totals.subtotalPaise,

      discountPaise:
        totals.discountPaise,

      taxableAmountPaise:
        totals.taxableAmountPaise,

      taxPaise:
        totals.taxPaise,

      cgstPaise:
        totals.cgstPaise,

      sgstPaise:
        totals.sgstPaise,

      igstPaise:
        totals.igstPaise,

      totalPaise:
        totals.totalPaise,

      paidPaise:
        totals.paymentsPaise,

      refundedPaise:
        totals.refundsPaise,

      outstandingPaise:
        totals.outstandingPaise,

      status:
        nextStatus,

      updatedAt:
        now(),

      version:
        sql`
          ${folios.version} + 1
        `,
    })
    .where(
      eq(
        folios.id,
        folioId,
      ),
    );

  return totals;
}

export class BillingService {
  async ensureFolio(
    c: ReservationContext,
    reservationId: string,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.view',
    );

    return getDb().transaction(
      async (tx) => {
        await lock(
          tx,
          `folio:${reservationId}`,
        );

        const [existingFolio] =
          await tx
            .select()
            .from(folios)
            .where(
              and(
                eq(
                  folios.reservationId,
                  reservationId,
                ),
                eq(
                  folios.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  folios.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (existingFolio) {
          return existingFolio;
        }

        const [reservation] =
          await tx
            .select()
            .from(reservations)
            .where(
              and(
                eq(
                  reservations.id,
                  reservationId,
                ),
                eq(
                  reservations.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  reservations.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!reservation) {
          throw new DomainError(
            'RESERVATION_NOT_FOUND',
            'Reservation was not found.',
            404,
          );
        }

        const [stay] =
          await tx
            .select()
            .from(stays)
            .where(
              and(
                eq(
                  stays.reservationId,
                  reservationId,
                ),
                eq(
                  stays.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  stays.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        const profile =
          await propertyProfile(
            tx,
            c,
          );

        const issued =
          await nextNumber(
            tx,
            c.property.id,
            new Date(),
            'FOLIO',
            `${propertyDocumentCode(profile.code)}-FOL`,
          );

        const [createdFolio] =
          await tx
            .insert(folios)
            .values({
              id:
                crypto.randomUUID(),

              organisationId:
                c.actor.organisationId,

              propertyId:
                c.property.id,

              folioNumber:
                issued.number,

              reservationId,

              guestId:
                reservation.guestId,

              stayId:
                stay?.id,

              status:
                'OPEN',

              subtotalPaise:
                0,

              taxPaise:
                0,

              totalPaise:
                0,

              discountPaise:
                0,

              taxableAmountPaise:
                0,

              cgstPaise:
                0,

              sgstPaise:
                0,

              igstPaise:
                0,

              paidPaise:
                0,

              refundedPaise:
                0,

              outstandingPaise:
                0,

              updatedAt:
                now(),
            })
            .onConflictDoNothing({
              target:
                folios.reservationId,
            })
            .returning();

        const folio =
          createdFolio ??
          (
            await tx
              .select()
              .from(folios)
              .where(
                and(
                  eq(
                    folios.reservationId,
                    reservationId,
                  ),
                  eq(
                    folios.organisationId,
                    c.actor.organisationId,
                  ),
                  eq(
                    folios.propertyId,
                    c.property.id,
                  ),
                ),
              )
              .limit(1)
          )[0];

        if (!folio) {
          throw new DomainError(
            'FOLIO_CREATE_FAILED',
            'Financial folio could not be created.',
            500,
          );
        }

        await audit(
          tx,
          c,
          'FOLIO_ENSURED',
          'FOLIO',
          folio.id,
          {
            reservationId,
            folioNumber:
              folio.folioNumber,
          },
        );

        return folio;
      },
    );
  }

  async list(c: ReservationContext) {
  scope(c);

  assertRoleCan(
    c.actor.role,
    'billing.view',
  );

  return getDb()
    .select()
    .from(folios)
    .where(
      and(
        eq(
          folios.organisationId,
          c.actor.organisationId,
        ),
        eq(
          folios.propertyId,
          c.property.id,
        ),
      ),
    )
    .orderBy(
      asc(folios.folioNumber),
    );
}

  async get(
    c: ReservationContext,
    id: string,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.view',
    );

    const db =
      getDb();

    const folio =
      await scopedFolio(
        db as unknown as Tx,
        c,
        id,
      );

    const [reservation] =
      await db
        .select()
        .from(
          reservations,
        )
        .where(
          eq(
            reservations.id,
            folio.reservationId,
          ),
        )
        .limit(1);

    const [guest] =
      reservation
        ? await db
            .select()
            .from(guests)
            .where(
              eq(
                guests.id,
                reservation.guestId,
              ),
            )
            .limit(1)
        : [];

    const [room] =
      reservation?.roomId
        ? await db
            .select()
            .from(rooms)
            .where(
              eq(
                rooms.id,
                reservation.roomId,
              ),
            )
            .limit(1)
        : [];

    const [
      lines,
      ledger,
      refundRows,
      invoiceRows,
    ] = await Promise.all([
      db
        .select()
        .from(folioLines)
        .where(
          eq(
            folioLines.folioId,
            id,
          ),
        )
        .orderBy(
          asc(
            folioLines.createdAt,
          ),
        ),

      db
        .select()
        .from(payments)
        .where(
          eq(
            payments.folioId,
            id,
          ),
        )
        .orderBy(
          asc(
            payments.receivedAt,
          ),
        ),

      db
        .select()
        .from(
          paymentRefunds,
        )
        .where(
          eq(
            paymentRefunds.folioId,
            id,
          ),
        )
        .orderBy(
          asc(
            paymentRefunds.processedAt,
          ),
        ),

      db
        .select()
        .from(invoices)
        .where(
          eq(
            invoices.folioId,
            id,
          ),
        )
        .orderBy(
          asc(
            invoices.createdAt,
          ),
        ),
    ]);

    return {
      folio,
      reservation,
      guest,
      room,
      lines,
      payments:
        ledger,
      refunds:
        refundRows,
      invoices:
        invoiceRows,
    };
  }

  async postRoomCharges(
    c: ReservationContext,
    folioId: string,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.post_charge',
    );

    return getDb().transaction(
      async (tx) => {
        await lock(
          tx,
          `folio:${folioId}`,
        );

        const folio =
          await scopedFolio(
            tx,
            c,
            folioId,
          );

        await ensureOpen(
          folio,
        );

        const [reservation] =
          await tx
            .select()
            .from(
              reservations,
            )
            .where(
              and(
                eq(
                  reservations.id,
                  folio.reservationId,
                ),
                eq(
                  reservations.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  reservations.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!reservation) {
          throw new DomainError(
            'RESERVATION_NOT_FOUND',
            'Reservation was not found.',
            404,
          );
        }

        const profile =
          await propertyProfile(
            tx,
            c,
          );

        const dates =
          roomChargeDates(
            reservation.arrivalDate,
            reservation.departureDate,
          );

        for (
          const date of dates
        ) {
          const values =
            calculateLine(
              1,
              reservation.nightlyRatePaise,
              0,
              reservation.taxRateBps,
              (
                reservation.taxRateBps
                  ? profile.defaultTaxMode
                  : 'EXEMPT'
              ) as TaxMode,
            );

          await tx
            .insert(
              folioLines,
            )
            .values({
              id:
                crypto.randomUUID(),

              organisationId:
                c.actor
                  .organisationId,

              propertyId:
                c.property.id,

              folioId,

              description:
                `${date} Room Charge`,

              category:
                'ROOM_CHARGE',

              quantity:
                1,

              unitAmountPaise:
                reservation.nightlyRatePaise,

              taxRateBps:
                reservation.taxRateBps,

              lineTotalPaise:
                values.totalPaise,

              ...values,

              source:
                'RESERVATION_RATE',

              sourceType:
                'ROOM_NIGHT',

              sourceId:
                `${reservation.id}:${date}`,

              serviceDate:
                date,

              postedBy:
                c.actor.id,

              createdAt:
                now(),
            })
            .onConflictDoNothing();
        }

        const totals =
          await recalculate(
            tx,
            c,
            folioId,
          );

        await audit(
          tx,
          c,
          'ROOM_CHARGES_POSTED',
          'FOLIO',
          folioId,
          {
            nights:
              dates.length,
          },
        );

        return totals;
      },
    );
  }

  async postCharge(
    c: ReservationContext,
    folioId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.post_charge',
    );

    const input =
      manualChargeSchema.parse(
        raw,
      );

    return getDb().transaction(
      async (tx) => {
        await lock(
          tx,
          `folio:${folioId}`,
        );

        const folio =
          await scopedFolio(
            tx,
            c,
            folioId,
          );

        await ensureOpen(
          folio,
        );

        const profile =
          await propertyProfile(
            tx,
            c,
          );

        const values =
          calculateLine(
            input.quantity,
            input.unitAmountPaise,
            0,
            input.taxRateBps ??
              profile.defaultTaxRateBps,
            (
              input.taxMode ??
              profile.defaultTaxMode
            ) as TaxMode,
          );

        await tx
          .insert(folioLines)
          .values({
            id:
              crypto.randomUUID(),

            organisationId:
              c.actor
                .organisationId,

            propertyId:
              c.property.id,

            folioId,

            description:
              input.description,

            category:
              input.category,

            quantity:
              input.quantity,

            unitAmountPaise:
              input.unitAmountPaise,

            taxRateBps:
              input.taxRateBps ??
              profile.defaultTaxRateBps,

            lineTotalPaise:
              values.totalPaise,

            ...values,

            source:
              'MANUAL',

            sourceType:
              'MANUAL_CHARGE',

            sourceId:
              input.idempotencyKey,

            postedBy:
              c.actor.id,

            createdAt:
              now(),
          })
          .onConflictDoNothing();

        await audit(
          tx,
          c,
          'CHARGE_POSTED',
          'FOLIO',
          folioId,
          {
            category:
              input.category,

            amountPaise:
              values.totalPaise,
          },
        );

        return recalculate(
          tx,
          c,
          folioId,
        );
      },
    );
  }

  async discount(
    c: ReservationContext,
    folioId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.discount',
    );

    const input =
      discountSchema.parse(
        raw,
      );

    return getDb().transaction(
      async (tx) => {
        await lock(
          tx,
          `folio:${folioId}`,
        );

        const folio =
          await scopedFolio(
            tx,
            c,
            folioId,
          );

        await ensureOpen(
          folio,
        );

        const discount =
          input.kind ===
          'FIXED'
            ? input.amountPaise
            : Math.round(
                (
                  folio.subtotalPaise *
                  input.percentageBps
                ) /
                  10000,
              );

        if (
          discount >
          folio.subtotalPaise -
            folio.discountPaise
        ) {
          throw new DomainError(
            'DISCOUNT_EXCEEDS_CHARGES',
            'Discount exceeds available charges.',
            409,
          );
        }

        const profile =
          await propertyProfile(
            tx,
            c,
          );

        const tax =
          calculateLine(
            1,
            discount,
            0,
            profile.defaultTaxRateBps,
            profile.defaultTaxMode as TaxMode,
          );

        await tx
          .insert(folioLines)
          .values({
            id:
              crypto.randomUUID(),

            organisationId:
              c.actor
                .organisationId,

            propertyId:
              c.property.id,

            folioId,

            description:
              `Discount: ${input.reason}`,

            category:
              'DISCOUNT',

            quantity:
              1,

            unitAmountPaise:
              0,

            taxRateBps:
              profile.defaultTaxRateBps,

            lineTotalPaise:
              -tax.totalPaise,

            subtotalPaise:
              0,

            discountPaise:
              discount,

            taxableAmountPaise:
              -discount,

            taxPaise:
              -tax.taxPaise,

            cgstPaise:
              -tax.cgstPaise,

            sgstPaise:
              -tax.sgstPaise,

            igstPaise:
              -tax.igstPaise,

            source:
              'MANUAL',

            sourceType:
              'DISCOUNT',

            sourceId:
              input.idempotencyKey,

            postedBy:
              c.actor.id,

            createdAt:
              now(),
          })
          .onConflictDoNothing();

        await audit(
          tx,
          c,
          'DISCOUNT_APPLIED',
          'FOLIO',
          folioId,
          {
            amountPaise:
              discount,

            reason:
              input.reason,
          },
        );

        return recalculate(
          tx,
          c,
          folioId,
        );
      },
    );
  }

  async takePayment(
    c: ReservationContext,
    folioId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.take_payment',
    );

    const input =
      paymentSchema.parse(
        raw,
      );

    return getDb().transaction(
      async (tx) => {
        await lock(
          tx,
          `folio:${folioId}`,
        );

        const folio =
          await scopedFolio(
            tx,
            c,
            folioId,
          );

        ensureSettlementAllowed(
          folio,
        );

        const [existing] =
          await tx
            .select()
            .from(payments)
            .where(
              and(
                eq(
                  payments.folioId,
                  folioId,
                ),
                eq(
                  payments.idempotencyKey,
                  input.idempotencyKey,
                ),
              ),
            )
            .limit(1);

        if (existing) {
          return existing;
        }

        const profile =
          await propertyProfile(
            tx,
            c,
          );

        const issued =
          await nextNumber(
            tx,
            c.property.id,
            new Date(),
            'RECEIPT',
            profile.receiptPrefix,
          );

        const timestamp =
          now();

        const [payment] =
          await tx
            .insert(payments)
            .values({
              id:
                crypto.randomUUID(),

              organisationId:
                c.actor
                  .organisationId,

              propertyId:
                c.property.id,

              folioId,

              reservationId:
                folio.reservationId,

              paymentNumber:
                issued.number,

              method:
                input.method,

              amountPaise:
                input.amountPaise,

              reference:
                input.reference,

              notes:
                input.notes,

              status:
                'RECEIVED',

              idempotencyKey:
                input.idempotencyKey,

              receivedAt:
                timestamp,

              receivedBy:
                c.actor.id,

              createdAt:
                timestamp,

              updatedAt:
                timestamp,
            })
            .returning();

        await recalculate(
          tx,
          c,
          folioId,
        );

        await audit(
          tx,
          c,
          'PAYMENT_RECEIVED',
          'PAYMENT',
          payment.id,
          {
            amountPaise:
              payment.amountPaise,

            method:
              payment.method,
          },
        );

        return payment;
      },
    );
  }

  async reversePayment(
    c: ReservationContext,
    paymentId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.reverse_payment',
    );

    const input =
      reversalSchema.parse(
        raw,
      );

    return getDb().transaction(
      async (tx) => {
        /*
         * Payment-level lock prevents
         * concurrent mutations against
         * the same payment.
         */
        await lock(
          tx,
          `payment:${paymentId}`,
        );

        const [payment] =
          await tx
            .select()
            .from(payments)
            .where(
              and(
                eq(
                  payments.id,
                  paymentId,
                ),
                eq(
                  payments.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  payments.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!payment) {
          throw new DomainError(
            'PAYMENT_NOT_FOUND',
            'Payment was not found.',
            404,
          );
        }

        /*
         * Folio-level lock serializes
         * all financial recalculations
         * for this folio.
         */
        await lock(
          tx,
          `folio:${payment.folioId}`,
        );

        if (
          payment.status ===
          'REVERSED'
        ) {
          return payment;
        }

        const refunded =
          await tx
            .select()
            .from(
              paymentRefunds,
            )
            .where(
              and(
                eq(
                  paymentRefunds.paymentId,
                  paymentId,
                ),
                eq(
                  paymentRefunds.status,
                  'RECORDED',
                ),
              ),
            );

        if (
          refunded.length
        ) {
          throw new DomainError(
            'PAYMENT_HAS_REFUNDS',
            'A refunded payment cannot be reversed.',
            409,
          );
        }

        const timestamp =
          now();

        const [updated] =
          await tx
            .update(payments)
            .set({
              status:
                'REVERSED',

              reversedAt:
                timestamp,

              reversedBy:
                c.actor.id,

              reversalReason:
                input.reason,

              updatedAt:
                timestamp,
            })
            .where(
              and(
                eq(
                  payments.id,
                  paymentId,
                ),
                eq(
                  payments.status,
                  'RECEIVED',
                ),
              ),
            )
            .returning();

        await recalculate(
          tx,
          c,
          payment.folioId,
        );

        await audit(
          tx,
          c,
          'PAYMENT_REVERSED',
          'PAYMENT',
          paymentId,
          {
            amountPaise:
              payment.amountPaise,

            reason:
              input.reason,
          },
        );

        return updated;
      },
    );
  }

  async refund(
    c: ReservationContext,
    paymentId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.refund',
    );

    const input =
      refundSchema.parse(
        raw,
      );

    return getDb().transaction(
      async (tx) => {
        /*
         * Prevent two refund/reversal
         * operations mutating the same
         * payment simultaneously.
         */
        await lock(
          tx,
          `payment:${paymentId}`,
        );

        const [payment] =
          await tx
            .select()
            .from(payments)
            .where(
              and(
                eq(
                  payments.id,
                  paymentId,
                ),
                eq(
                  payments.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  payments.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!payment) {
          throw new DomainError(
            'PAYMENT_NOT_FOUND',
            'Payment was not found.',
            404,
          );
        }

        /*
         * IMPORTANT:
         * Lock the whole folio before
         * changing refund totals.
         */
        await lock(
          tx,
          `folio:${payment.folioId}`,
        );

        if (
          payment.status !==
          'RECEIVED'
        ) {
          throw new DomainError(
            'PAYMENT_NOT_REFUNDABLE',
            'Payment is not refundable.',
            409,
          );
        }

        const [existing] =
          await tx
            .select()
            .from(
              paymentRefunds,
            )
            .where(
              and(
                eq(
                  paymentRefunds.paymentId,
                  paymentId,
                ),
                eq(
                  paymentRefunds.idempotencyKey,
                  input.idempotencyKey,
                ),
              ),
            )
            .limit(1);

        if (existing) {
          return existing;
        }

        const prior =
          await tx
            .select()
            .from(
              paymentRefunds,
            )
            .where(
              and(
                eq(
                  paymentRefunds.paymentId,
                  paymentId,
                ),
                eq(
                  paymentRefunds.status,
                  'RECORDED',
                ),
              ),
            );

        const alreadyRefunded =
          prior.reduce(
            (
              sum,
              row,
            ) =>
              sum +
              row.amountPaise,
            0,
          );

        if (
          alreadyRefunded +
            input.amountPaise >
          payment.amountPaise
        ) {
          throw new DomainError(
            'REFUND_EXCEEDS_PAYMENT',
            'Refund exceeds the remaining refundable amount.',
            409,
          );
        }

        const [refund] =
          await tx
            .insert(
              paymentRefunds,
            )
            .values({
              id:
                crypto.randomUUID(),

              organisationId:
                c.actor
                  .organisationId,

              propertyId:
                c.property.id,

              folioId:
                payment.folioId,

              paymentId,

              amountPaise:
                input.amountPaise,

              reason:
                input.reason,

              reference:
                input.reference,

              status:
                'RECORDED',

              idempotencyKey:
                input.idempotencyKey,

              processedAt:
                now(),

              processedBy:
                c.actor.id,
            })
            .returning();

        await recalculate(
          tx,
          c,
          payment.folioId,
        );

        await audit(
          tx,
          c,
          'REFUND_RECORDED',
          'PAYMENT_REFUND',
          refund.id,
          {
            amountPaise:
              refund.amountPaise,

            reason:
              refund.reason,
          },
        );

        return refund;
      },
    );
  }

  async issueInvoice(
    c: ReservationContext,
    folioId: string,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.invoice',
    );

    return getDb().transaction(
      async (tx) => {
        /*
         * Lock the folio first so invoice issuance cannot race
         * with any other financial mutation using the same folio.
         */
        await lock(
          tx,
          `folio:${folioId}`,
        );

        await lock(
          tx,
          `invoice:${folioId}`,
        );

        const folio =
          await scopedFolio(
            tx,
            c,
            folioId,
          );

        /*
         * Final tax invoices are only issued from a formally
         * closed folio. This prevents an issued invoice from
         * becoming stale because of later charge/discount changes.
         */
        if (
          folio.status !==
          'CLOSED'
        ) {
          throw new DomainError(
            'FOLIO_NOT_CLOSED',
            'Final invoice can only be issued for a closed folio.',
            409,
          );
        }

        const [existing] =
          await tx
            .select()
            .from(invoices)
            .where(
              and(
                eq(
                  invoices.folioId,
                  folioId,
                ),
                eq(
                  invoices.status,
                  'ISSUED',
                ),
              ),
            )
            .limit(1);

        /*
         * Invoice issuance is idempotent at folio level while
         * an active ISSUED invoice already exists.
         */
        if (existing) {
          return existing;
        }

        const [reservation] =
          await tx
            .select()
            .from(
              reservations,
            )
            .where(
              and(
                eq(
                  reservations.id,
                  folio.reservationId,
                ),
                eq(
                  reservations.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  reservations.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!reservation) {
          throw new DomainError(
            'RESERVATION_NOT_FOUND',
            'Reservation was not found.',
            404,
          );
        }

        const [guest] =
          await tx
            .select()
            .from(guests)
            .where(
              and(
                eq(
                  guests.id,
                  reservation.guestId,
                ),
                eq(
                  guests.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  guests.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!guest) {
          throw new DomainError(
            'GUEST_NOT_FOUND',
            'Guest was not found.',
            404,
          );
        }

        const profile =
          await propertyProfile(
            tx,
            c,
          );

        const timestamp =
          new Date();

        const issued =
          await nextNumber(
            tx,
            c.property.id,
            timestamp,
            'INVOICE',
            profile.invoicePrefix,
          );

        const [invoice] =
          await tx
            .insert(invoices)
            .values({
              id:
                crypto.randomUUID(),

              organisationId:
                c.actor
                  .organisationId,

              propertyId:
                c.property.id,

              folioId,

              reservationId:
                reservation.id,

              guestId:
                guest.id,

              invoiceNumber:
                issued.number,

              financialYear:
                issued.financialYear,

              invoiceDate:
                timestamp
                  .toISOString()
                  .slice(
                    0,
                    10,
                  ),

              customerNameSnapshot:
                guest.fullName,

              customerCompanySnapshot:
                guest.companyName,

              customerGstinSnapshot:
                guest.gstin,

              billingAddressSnapshot:
                [
                  guest.addressLine1,
                  guest.addressLine2,
                  guest.city,
                  guest.state,
                  guest.postalCode,
                  guest.country,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    ', ',
                  ),

              customerStateSnapshot:
                guest.state,

              propertyLegalNameSnapshot:
                profile.legalName ??
                profile.name,

              propertyGstinSnapshot:
                profile.gstin,

              propertyAddressSnapshot:
                profile.billingAddress ??
                profile.city,

              subtotalPaise:
                folio.subtotalPaise,

              discountPaise:
                folio.discountPaise,

              taxableAmountPaise:
                folio.taxableAmountPaise,

              cgstPaise:
                folio.cgstPaise,

              sgstPaise:
                folio.sgstPaise,

              igstPaise:
                folio.igstPaise,

              grandTotalPaise:
                folio.totalPaise,

              status:
                'ISSUED',

              issuedAt:
                timestamp.toISOString(),

              issuedBy:
                c.actor.id,

              createdAt:
                timestamp.toISOString(),
            })
            .returning();

        await audit(
          tx,
          c,
          'INVOICE_ISSUED',
          'INVOICE',
          invoice.id,
          {
            invoiceNumber:
              invoice.invoiceNumber,

            folioId,

            grandTotalPaise:
              invoice.grandTotalPaise,
          },
        );

        return invoice;
      },
    );
  }

  async cancelInvoice(
    c: ReservationContext,
    invoiceId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.invoice',
    );

    const input =
      invoiceCancelSchema.parse(
        raw,
      );

    return getDb().transaction(
      async (tx) => {
        /*
         * Serialize mutations against the same invoice.
         */
        await lock(
          tx,
          `invoice-id:${invoiceId}`,
        );

        const [invoice] =
          await tx
            .select()
            .from(invoices)
            .where(
              and(
                eq(
                  invoices.id,
                  invoiceId,
                ),
                eq(
                  invoices.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  invoices.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1);

        if (!invoice) {
          throw new DomainError(
            'INVOICE_NOT_FOUND',
            'Invoice was not found.',
            404,
          );
        }

        /*
         * Repeated cancellation requests are safe and return
         * the already-cancelled invoice.
         */
        if (
          invoice.status ===
          'CANCELLED'
        ) {
          return invoice;
        }

        if (
          invoice.status !==
          'ISSUED'
        ) {
          throw new DomainError(
            'INVOICE_NOT_CANCELLABLE',
            'Only an issued invoice can be cancelled.',
            409,
          );
        }

        /*
         * Reuse the same folio-level serialization used by
         * financial posting and invoice issuance.
         */
        await lock(
          tx,
          `folio:${invoice.folioId}`,
        );

        const timestamp =
          now();

        const [updated] =
          await tx
            .update(invoices)
            .set({
              status:
                'CANCELLED',

              cancelledAt:
                timestamp,

              cancelledBy:
                c.actor.id,

              cancelReason:
                input.reason,
            })
            .where(
              and(
                eq(
                  invoices.id,
                  invoiceId,
                ),
                eq(
                  invoices.status,
                  'ISSUED',
                ),
              ),
            )
            .returning();

        if (!updated) {
          throw new DomainError(
            'INVOICE_STATE_CHANGED',
            'Invoice status changed before cancellation could be completed.',
            409,
          );
        }

        await audit(
          tx,
          c,
          'INVOICE_CANCELLED',
          'INVOICE',
          invoiceId,
          {
            invoiceNumber:
              invoice.invoiceNumber,

            folioId:
              invoice.folioId,

            reason:
              input.reason,
          },
        );

        return updated;
      },
    );
  }

  async financialCheckout(
    c: ReservationContext,
    reservationId: string,
    raw: unknown,
  ) {
    scope(c);

    assertRoleCan(
      c.actor.role,
      'billing.checkout',
    );

    const input =
      checkoutSchema.parse(
        raw,
      );

    if (
      input.allowOutstanding &&
      !roleCan(
        c.actor.role,
        'billing.override_checkout',
      )
    ) {
      throw new DomainError(
        'FORBIDDEN',
        'Unpaid checkout override is not permitted.',
        403,
      );
    }

    const folio =
      await this.ensureFolio(
        c,
        reservationId,
      );

    const [reservationBeforeCheckout] =
      await getDb()
        .select({
          status:
            reservations.status,
        })
        .from(reservations)
        .where(
          and(
            eq(
              reservations.id,
              reservationId,
            ),
            eq(
              reservations.organisationId,
              c.actor.organisationId,
            ),
            eq(
              reservations.propertyId,
              c.property.id,
            ),
          ),
        )
        .limit(1);

    if (!reservationBeforeCheckout) {
      throw new DomainError(
        'RESERVATION_NOT_FOUND',
        'Reservation was not found.',
        404,
      );
    }

    /*
     * The first checkout action posts all due room-night rent.
     * Once the checkout inspection starts, normal charge posting is locked.
     */
    if (
      reservationBeforeCheckout.status ===
      'CHECKED_IN'
    ) {
      await this.postRoomCharges(
        c,
        folio.id,
      );
    }

    return getDb().transaction(
      async (tx) => {
        await lock(
          tx,
          `checkout:${reservationId}`,
        );

        const current =
          await scopedFolio(
            tx,
            c,
            folio.id,
          );

        const [reservation] =
          await tx
            .select()
            .from(reservations)
            .where(
              and(
                eq(
                  reservations.id,
                  reservationId,
                ),
                eq(
                  reservations.organisationId,
                  c.actor.organisationId,
                ),
                eq(
                  reservations.propertyId,
                  c.property.id,
                ),
              ),
            )
            .limit(1)
            .for('update');

        if (!reservation) {
          throw new DomainError(
            'RESERVATION_NOT_FOUND',
            'Reservation was not found.',
            404,
          );
        }

        /*
         * Stage 1:
         * Operational checkout.
         *
         * Guest leaves the room, but the financial folio is NOT closed yet.
         * Housekeeping must inspect the room before the final bill can close.
         */
        if (
          reservation.status ===
          'CHECKED_IN'
        ) {
          if (
            current.status ===
              'CLOSED' ||
            current.status ===
              'VOID'
          ) {
            throw new DomainError(
              'FOLIO_CLOSED',
              'This folio cannot enter checkout inspection.',
              409,
            );
          }

          if (!reservation.roomId) {
            throw new DomainError(
              'ROOM_NOT_ASSIGNED',
              'The checked-in reservation has no assigned room.',
              409,
            );
          }

          const [stay] =
            await tx
              .select()
              .from(stays)
              .where(
                and(
                  eq(
                    stays.reservationId,
                    reservationId,
                  ),
                  eq(
                    stays.organisationId,
                    c.actor.organisationId,
                  ),
                  eq(
                    stays.propertyId,
                    c.property.id,
                  ),
                  eq(
                    stays.status,
                    'IN_HOUSE',
                  ),
                ),
              )
              .limit(1)
              .for('update');

          const [room] =
            await tx
              .select()
              .from(rooms)
              .where(
                and(
                  eq(
                    rooms.id,
                    reservation.roomId,
                  ),
                  eq(
                    rooms.propertyId,
                    c.property.id,
                  ),
                ),
              )
              .limit(1)
              .for('update');

          if (
            !stay ||
            !room
          ) {
            throw new DomainError(
              'STAY_NOT_FOUND',
              'Active stay was not found.',
              404,
            );
          }

          const timestamp =
            now();

          const reservationUpdate =
            await tx
              .update(reservations)
              .set({
                status:
                  'CHECKED_OUT',
                updatedBy:
                  c.actor.id,
                updatedAt:
                  timestamp,
                version:
                  reservation.version +
                  1,
              })
              .where(
                and(
                  eq(
                    reservations.id,
                    reservation.id,
                  ),
                  eq(
                    reservations.version,
                    reservation.version,
                  ),
                ),
              )
              .returning({
                id:
                  reservations.id,
              });

          if (
            !reservationUpdate.length
          ) {
            throw new DomainError(
              'RESERVATION_STATE_CHANGED',
              'Reservation changed before checkout could begin.',
              409,
            );
          }

          const stayUpdate =
            await tx
              .update(stays)
              .set({
                status:
                  'CHECKED_OUT',
                actualCheckOutAt:
                  timestamp,
                checkedOutBy:
                  c.actor.id,
                updatedAt:
                  timestamp,
                version:
                  stay.version + 1,
              })
              .where(
                and(
                  eq(
                    stays.id,
                    stay.id,
                  ),
                  eq(
                    stays.version,
                    stay.version,
                  ),
                ),
              )
              .returning({
                id:
                  stays.id,
              });

          if (
            !stayUpdate.length
          ) {
            throw new DomainError(
              'STAY_STATE_CHANGED',
              'Stay changed before checkout could begin.',
              409,
            );
          }

          const roomUpdate =
            await tx
              .update(rooms)
              .set({
                occupancyStatus:
                  'VACANT',
                operationalStatus:
                  'VACANT_DIRTY',
                updatedAt:
                  timestamp,
                version:
                  room.version + 1,
              })
              .where(
                and(
                  eq(
                    rooms.id,
                    room.id,
                  ),
                  eq(
                    rooms.version,
                    room.version,
                  ),
                ),
              )
              .returning({
                id:
                  rooms.id,
              });

          if (
            !roomUpdate.length
          ) {
            throw new DomainError(
              'ROOM_STATE_CHANGED',
              'Room status changed before checkout could begin.',
              409,
            );
          }

          await tx
            .insert(
              housekeepingTasks,
            )
            .values({
              id:
                crypto.randomUUID(),
              propertyId:
                c.property.id,
              roomId:
                room.id,
              reservationId:
                reservation.id,
              taskType:
                'CHECKOUT_INSPECTION',
              priority:
                'HIGH',
              status:
                'NEEDS_INSPECTION',
              scheduledAt:
                timestamp,
              updatedAt:
                timestamp,
              version:
                1,
              notes:
                'Inspect room condition, missing items, minibar/linen usage and damage before final folio closure.',
            })
            .onConflictDoNothing();

          const folioUpdate =
            await tx
              .update(folios)
              .set({
                status:
                  'PENDING_INSPECTION',
                closedAt:
                  null,
                closedBy:
                  null,
                updatedAt:
                  timestamp,
                version:
                  current.version +
                  1,
              })
              .where(
                and(
                  eq(
                    folios.id,
                    current.id,
                  ),
                  eq(
                    folios.version,
                    current.version,
                  ),
                ),
              )
              .returning({
                id:
                  folios.id,
              });

          if (
            !folioUpdate.length
          ) {
            throw new DomainError(
              'FOLIO_STATE_CHANGED',
              'Folio changed before checkout inspection could begin.',
              409,
            );
          }

          await audit(
            tx,
            c,
            'CHECKOUT_INSPECTION_REQUESTED',
            'RESERVATION',
            reservationId,
            {
              folioId:
                current.id,
              roomId:
                room.id,
              outstandingPaise:
                current.outstandingPaise,
              folioStatus:
                'PENDING_INSPECTION',
            },
          );

          return {
            reservationId,
            stayId:
              stay.id,
            folioId:
              current.id,
            status:
              'PENDING_INSPECTION',
            outstandingPaise:
              current.outstandingPaise,
          };
        }

        /*
         * Stage 2:
         * Final financial closure after housekeeping inspection and
         * manager damage review.
         */
        if (
          reservation.status !==
          'CHECKED_OUT'
        ) {
          throw new DomainError(
            'INVALID_CHECKOUT_STATUS',
            'Reservation is not eligible for checkout.',
            409,
          );
        }

        if (
          current.status ===
          'CLOSED'
        ) {
          return {
            reservationId,
            folioId:
              current.id,
            status:
              'CLOSED',
            outstandingPaise:
              current.outstandingPaise,
          };
        }

        if (
          current.status ===
          'VOID'
        ) {
          throw new DomainError(
            'FOLIO_VOID',
            'A void folio cannot be closed through checkout.',
            409,
          );
        }

        const [inspection] =
          await tx
            .select({
              id:
                housekeepingTasks.id,
              status:
                housekeepingTasks.status,
              outcome:
                housekeepingTasks.outcome,
            })
            .from(
              housekeepingTasks,
            )
            .where(
              and(
                eq(
                  housekeepingTasks.propertyId,
                  c.property.id,
                ),
                eq(
                  housekeepingTasks.reservationId,
                  reservationId,
                ),
                eq(
                  housekeepingTasks.taskType,
                  'CHECKOUT_INSPECTION',
                ),
              ),
            )
            .limit(1);

        if (
          !inspection ||
          inspection.status !==
            'COMPLETED'
        ) {
          throw new DomainError(
            'CHECKOUT_INSPECTION_PENDING',
            'Housekeeping must complete the checkout inspection before final folio closure.',
            409,
          );
        }

        const [pendingDamage] =
          await tx
            .select({
              id:
                damageReports.id,
            })
            .from(
              damageReports,
            )
            .where(
              and(
                eq(
                  damageReports.propertyId,
                  c.property.id,
                ),
                eq(
                  damageReports.reservationId,
                  reservationId,
                ),
                eq(
                  damageReports.status,
                  'PENDING_REVIEW',
                ),
              ),
            )
            .limit(1);

        if (
          pendingDamage ||
          current.status ===
            'PENDING_DAMAGE_REVIEW'
        ) {
          throw new DomainError(
            'DAMAGE_REVIEW_PENDING',
            'Manager damage review must be completed before final folio closure.',
            409,
          );
        }

        if (
          current.status ===
          'PENDING_INSPECTION'
        ) {
          throw new DomainError(
            'CHECKOUT_INSPECTION_PENDING',
            'Housekeeping inspection is still pending.',
            409,
          );
        }

        if (
          current.outstandingPaise >
            0 &&
          !input.allowOutstanding
        ) {
          throw new DomainError(
            'OUTSTANDING_BALANCE',
            `Final checkout is blocked with ${current.outstandingPaise} paise outstanding.`,
            409,
          );
        }

        const timestamp =
          now();

        const closed =
          await tx
            .update(folios)
            .set({
              status:
                'CLOSED',
              closedAt:
                timestamp,
              closedBy:
                c.actor.id,
              updatedAt:
                timestamp,
              version:
                current.version +
                1,
            })
            .where(
              and(
                eq(
                  folios.id,
                  current.id,
                ),
                eq(
                  folios.version,
                  current.version,
                ),
              ),
            )
            .returning({
              id:
                folios.id,
            });

        if (
          !closed.length
        ) {
          throw new DomainError(
            'FOLIO_STATE_CHANGED',
            'Folio changed before final checkout could be completed.',
            409,
          );
        }

        await audit(
          tx,
          c,
          input.allowOutstanding
            ? 'CHECKOUT_OVERRIDE'
            : 'FINANCIAL_CHECKOUT',
          'FOLIO',
          current.id,
          {
            reservationId,
            inspectionId:
              inspection.id,
            inspectionOutcome:
              inspection.outcome,
            outstandingPaise:
              current.outstandingPaise,
            reason:
              input.overrideReason ??
              null,
          },
        );

        return {
          reservationId,
          folioId:
            current.id,
          status:
            'CLOSED',
          outstandingPaise:
            current.outstandingPaise,
        };
      },
    );
  }
}