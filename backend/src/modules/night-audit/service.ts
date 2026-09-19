import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';

import {
  assertRoleCan,
  DomainError,
} from '@hotel/shared/domain';

import { getDb } from '@/db';

import {
  auditLogs,
  paymentRefunds,
  payments,
  folioLines,
  folios,
  nightAuditRuns,
  properties,
  reservations,
  rooms,
} from '@/db/schema';

import {
  paiseToRupees,
  rupeesToPaise,
} from '@/db/money';

import {
  calculateFolio,
  calculateLine,
} from '@/modules/billing/calculations';

import {
  hotelAccommodationGstRateBps,
} from '@/modules/billing/india-gst';

import type { TaxMode } from '@/modules/billing/types';
import type { ReservationContext } from '@/services/reservations/types';

const ARRIVAL_STATUSES = [
  'PENDING',
  'HOLD',
  'CONFIRMED',
] as const;

function propertyCalendarDate(
  timezone: string,
  date = new Date(),
) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function sumRupees(values: number[]) {
  const paise = values.reduce(
    (total, value) =>
      total + rupeesToPaise(value),
    0,
  );

  return paiseToRupees(paise);
}

function dayDifference(
  fromDate: string,
  toDate: string,
) {
  const from = Date.parse(
    `${fromDate}T00:00:00Z`,
  );

  const to = Date.parse(
    `${toDate}T00:00:00Z`,
  );

  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    return 0;
  }

  return Math.round(
    (to - from) / 86_400_000,
  );
}

type Db = ReturnType<typeof getDb>;

type Tx =
  Parameters<
    Parameters<Db['transaction']>[0]
  >[0];

function nextBusinessDate(
  businessDate: string,
) {
  const date = new Date(
    `${businessDate}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + 1,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function localDateOf(
  value: string,
  timezone: string,
) {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).format(new Date(value));
}

async function recalculateAuditFolio(
  tx: Tx,
  c: ReservationContext,
  folioId: string,
) {
  const [current] = await tx
    .select()
    .from(folios)
    .where(
      and(
        eq(folios.id, folioId),
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

  if (!current) {
    throw new DomainError(
      'FOLIO_NOT_FOUND',
      'Night Audit folio was not found.',
      404,
    );
  }

  const lines = await tx
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

  const ledger = await tx
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

  const refunds = await tx
    .select()
    .from(paymentRefunds)
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

  const totals = calculateFolio(
    lines.map(line => ({
      ...line,
      totalRupees:
        line.lineTotalRupees,
    })),

    ledger.map(
      payment =>
        payment.amountRupees,
    ),

    ledger
      .filter(
        payment =>
          payment.status ===
          'REVERSED',
      )
      .map(
        payment =>
          payment.amountRupees,
      ),

    refunds
      .filter(
        refund =>
          refund.status ===
          'RECORDED',
      )
      .map(
        refund =>
          refund.amountRupees,
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
      : totals.outstandingRupees <= 0
        ? 'SETTLED'
        : 'OPEN';

  await tx
    .update(folios)
    .set({
      subtotalRupees:
        totals.subtotalRupees,

      discountRupees:
        totals.discountRupees,

      taxableAmountRupees:
        totals.taxableAmountRupees,

      taxRupees:
        totals.taxRupees,

      cgstRupees:
        totals.cgstRupees,

      sgstRupees:
        totals.sgstRupees,

      igstRupees:
        totals.igstRupees,

      totalRupees:
        totals.totalRupees,

      paidRupees:
        totals.paymentsRupees,

      refundedRupees:
        totals.refundsRupees,

      outstandingRupees:
        totals.outstandingRupees,

      status: nextStatus,

      updatedAt:
        new Date().toISOString(),

      version:
        sql`${folios.version} + 1`,
    })
    .where(
      eq(
        folios.id,
        folioId,
      ),
    );

  return totals;
}

function guard(c: ReservationContext) {
  assertRoleCan(
    c.actor.role,
    'night_audit.read',
  );

  if (
    c.actor.organisationId !==
    c.property.organisationId
  ) {
    throw new DomainError(
      'PROPERTY_ACCESS_DENIED',
      'The selected property does not belong to this organisation.',
      403,
    );
  }

  if (
    c.actor.role !== 'OWNER' &&
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

export class NightAuditService {
  async preview(c: ReservationContext) {
    guard(c);

    const db = getDb();

    const [property] = await db
      .select({
        id: properties.id,
        organisationId:
          properties.organisationId,
        name: properties.name,
        timezone: properties.timezone,
        businessDate:
          properties.businessDate,
        defaultTaxMode:
          properties.defaultTaxMode,
      })
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
          eq(properties.active, true),
        ),
      )
      .limit(1);

    if (!property) {
      throw new DomainError(
        'PROPERTY_NOT_FOUND',
        'The active property was not found.',
        404,
      );
    }

    const businessDate =
      property.businessDate;

    const calendarDate =
      propertyCalendarDate(
        property.timezone,
      );

    const [
      pendingArrivals,
      pendingDepartures,
      roomNightCandidates,
      existingRoomCharges,
      openFolioRows,
      existingRuns,
    ] = await Promise.all([
      db
        .select({
          id: reservations.id,
          reference:
            reservations.reference,
          guestName:
            reservations.primaryGuestName,
          arrivalDate:
            reservations.arrivalDate,
          status: reservations.status,
          roomId: reservations.roomId,
        })
        .from(reservations)
        .where(
          and(
            eq(
              reservations.organisationId,
              c.actor.organisationId,
            ),
            eq(
              reservations.propertyId,
              c.property.id,
            ),
            inArray(
              reservations.status,
              [...ARRIVAL_STATUSES],
            ),
            lte(
              reservations.arrivalDate,
              businessDate,
            ),
          ),
        )
        .orderBy(
          asc(reservations.arrivalDate),
          asc(reservations.reference),
        ),

      db
        .select({
          id: reservations.id,
          reference:
            reservations.reference,
          guestName:
            reservations.primaryGuestName,
          departureDate:
            reservations.departureDate,
          status: reservations.status,
          roomId: reservations.roomId,
        })
        .from(reservations)
        .where(
          and(
            eq(
              reservations.organisationId,
              c.actor.organisationId,
            ),
            eq(
              reservations.propertyId,
              c.property.id,
            ),
            eq(
              reservations.status,
              'CHECKED_IN',
            ),
            lte(
              reservations.departureDate,
              businessDate,
            ),
          ),
        )
        .orderBy(
          asc(reservations.departureDate),
          asc(reservations.reference),
        ),

      db
        .select({
          reservationId:
            reservations.id,
          reference:
            reservations.reference,
          guestName:
            reservations.primaryGuestName,

          arrivalDate:
            reservations.arrivalDate,

          departureDate:
            reservations.departureDate,

          roomId:
            reservations.roomId,

          roomNumber:
            rooms.number,

          nightlyRateRupees:
            reservations.nightlyRateRupees,

          taxRateBps:
            reservations.taxRateBps,

          folioId:
            folios.id,

          folioStatus:
            folios.status,
        })
        .from(reservations)
        .leftJoin(
          rooms,
          eq(
            rooms.id,
            reservations.roomId,
          ),
        )
        .leftJoin(
          folios,
          eq(
            folios.reservationId,
            reservations.id,
          ),
        )
        .where(
          and(
            eq(
              reservations.organisationId,
              c.actor.organisationId,
            ),
            eq(
              reservations.propertyId,
              c.property.id,
            ),
            eq(
              reservations.status,
              'CHECKED_IN',
            ),
            lte(
              reservations.arrivalDate,
              businessDate,
            ),
            gt(
              reservations.departureDate,
              businessDate,
            ),
          ),
        )
        .orderBy(
          asc(reservations.reference),
        ),

      db
        .select({
          id: folioLines.id,
          folioId: folioLines.folioId,
          sourceId:
            folioLines.sourceId,

          subtotalRupees:
            folioLines.subtotalRupees,

          taxRupees:
            folioLines.taxRupees,

          totalRupees:
            folioLines.lineTotalRupees,
        })
        .from(folioLines)
        .where(
          and(
            eq(
              folioLines.organisationId,
              c.actor.organisationId,
            ),
            eq(
              folioLines.propertyId,
              c.property.id,
            ),
            eq(
              folioLines.sourceType,
              'ROOM_NIGHT',
            ),
            eq(
              folioLines.serviceDate,
              businessDate,
            ),
            isNull(
              folioLines.voidedAt,
            ),
          ),
        ),

      db
        .select({
          id: folios.id,
          reservationId:
            folios.reservationId,
          folioNumber:
            folios.folioNumber,
          outstandingRupees:
            folios.outstandingRupees,
        })
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
            eq(
              folios.status,
              'OPEN',
            ),
          ),
        )
        .orderBy(
          asc(folios.folioNumber),
        ),

      db
        .select()
        .from(nightAuditRuns)
        .where(
          and(
            eq(
              nightAuditRuns.organisationId,
              c.actor.organisationId,
            ),
            eq(
              nightAuditRuns.propertyId,
              c.property.id,
            ),
            eq(
              nightAuditRuns.businessDate,
              businessDate,
            ),
          ),
        )
        .limit(1),
    ]);

    const existingRun =
      existingRuns[0] ?? null;

    /*
     * Group ROOM_NIGHT lines by deterministic source ID.
     *
     * Expected source ID:
     * reservationId:YYYY-MM-DD
     */
    const roomChargesBySource =
      new Map<
        string,
        typeof existingRoomCharges
      >();

    for (
      const line of existingRoomCharges
    ) {
      if (!line.sourceId) {
        continue;
      }

      const current =
        roomChargesBySource.get(
          line.sourceId,
        ) ?? [];

      current.push(line);

      roomChargesBySource.set(
        line.sourceId,
        current,
      );
    }

    const roomNights =
      roomNightCandidates.map(
        candidate => {
          const sourceId =
            `${candidate.reservationId}:${businessDate}`;

          const existingCharges =
            roomChargesBySource.get(
              sourceId,
            ) ?? [];

          const accommodationTaxRateBps =
            hotelAccommodationGstRateBps(
              candidate.nightlyRateRupees,
              businessDate,
              candidate.taxRateBps,
            );

          const projected =
            calculateLine(
              1,
              candidate.nightlyRateRupees,
              0,
              accommodationTaxRateBps,
              (
                accommodationTaxRateBps
                  ? property.defaultTaxMode
                  : 'EXEMPT'
              ) as TaxMode,
            );

          return {
            reservationId:
              candidate.reservationId,

            reference:
              candidate.reference,

            guestName:
              candidate.guestName,

            roomId:
              candidate.roomId,

            roomNumber:
              candidate.roomNumber,

            folioId:
              candidate.folioId,

            folioStatus:
              candidate.folioStatus,

            sourceId,

            alreadyPosted:
              existingCharges.length > 0,

            duplicatePostCount:
              Math.max(
                existingCharges.length - 1,
                0,
              ),

            nightlyRateRupees:
              candidate.nightlyRateRupees,

            taxRateBps:
              accommodationTaxRateBps,

            projectedSubtotalRupees:
              projected.subtotalRupees,

            projectedTaxRupees:
              projected.taxRupees,

            projectedTotalRupees:
              projected.totalRupees,

            existingSubtotalRupees:
              sumRupees(
                existingCharges.map(
                  line =>
                    line.subtotalRupees,
                ),
              ),

            existingTaxRupees:
              sumRupees(
                existingCharges.map(
                  line => line.taxRupees,
                ),
              ),

            existingTotalRupees:
              sumRupees(
                existingCharges.map(
                  line => line.totalRupees,
                ),
              ),
          };
        },
      );

    const missingRoomNights =
      roomNights.filter(
        item => !item.alreadyPosted,
      );

    const postedRoomNights =
      roomNights.filter(
        item => item.alreadyPosted,
      );

    const missingFolios =
      roomNights.filter(
        item => !item.folioId,
      );

    const closedFoliosForInHouse =
  roomNights.filter(
    item =>
      item.folioId &&
      !['OPEN', 'SETTLED'].includes(
        item.folioStatus ?? '',
      ),
  );

    const missingRoomAssignments =
      roomNights.filter(
        item =>
          !item.roomId ||
          !item.roomNumber,
      );

    const duplicateRoomCharges =
      roomNights.filter(
        item =>
          item.duplicatePostCount > 0,
      );

    const blockers: Array<{
      code: string;
      message: string;
      count: number;
    }> = [];

    if (
      businessDate > calendarDate
    ) {
      blockers.push({
        code:
          'BUSINESS_DATE_IN_FUTURE',

        message:
          'Business date is ahead of the property calendar date.',

        count: 1,
      });
    }

    if (
      existingRun?.status ===
      'COMPLETED'
    ) {
      blockers.push({
        code:
          'NIGHT_AUDIT_ALREADY_COMPLETED',

        message:
          'Night Audit has already been completed for this business date.',

        count: 1,
      });
    }

    if (
      pendingArrivals.length > 0
    ) {
      blockers.push({
        code:
          'UNRESOLVED_ARRIVALS',

        message:
          'Arrivals due on or before the business date must be checked in, cancelled, moved or marked no-show.',

        count:
          pendingArrivals.length,
      });
    }

    if (
      pendingDepartures.length > 0
    ) {
      blockers.push({
        code:
          'UNRESOLVED_DEPARTURES',

        message:
          'Departures due on or before the business date must be resolved before closing the day.',

        count:
          pendingDepartures.length,
      });
    }

    if (missingFolios.length > 0) {
      blockers.push({
        code:
          'IN_HOUSE_FOLIO_MISSING',

        message:
          'One or more in-house reservations do not have a financial folio.',

        count:
          missingFolios.length,
      });
    }

    if (
      closedFoliosForInHouse.length >
      0
    ) {
      blockers.push({
        code:
          'IN_HOUSE_FOLIO_CLOSED',

        message:
          'One or more in-house reservations have a closed folio.',

        count:
          closedFoliosForInHouse.length,
      });
    }

    if (
      missingRoomAssignments.length >
      0
    ) {
      blockers.push({
        code:
          'IN_HOUSE_ROOM_MISSING',

        message:
          'One or more in-house reservations do not have a valid room assignment.',

        count:
          missingRoomAssignments.length,
      });
    }

    if (
      duplicateRoomCharges.length >
      0
    ) {
      blockers.push({
        code:
          'DUPLICATE_ROOM_CHARGE',

        message:
          'Duplicate room-night charges already exist and must be reviewed before Night Audit can close.',

        count:
          duplicateRoomCharges.length,
      });
    }

    return {
      property: {
        id: property.id,
        name: property.name,
        timezone:
          property.timezone,
      },

      businessDate,

      propertyCalendarDate:
        calendarDate,

      businessDateLagDays:
        dayDifference(
          businessDate,
          calendarDate,
        ),

      existingRun:
        existingRun
          ? {
              id: existingRun.id,
              status:
                existingRun.status,
              startedAt:
                existingRun.startedAt,
              completedAt:
                existingRun.completedAt,
            }
          : null,

      canClose:
        blockers.length === 0,

      blockers,

      summary: {
        pendingArrivals:
          pendingArrivals.length,

        pendingDepartures:
          pendingDepartures.length,

        inHouseRoomNights:
          roomNights.length,

        roomNightsAlreadyPosted:
          postedRoomNights.length,

        roomNightsToPost:
          missingRoomNights.length,

        openFolios:
          openFolioRows.length,

        outstandingRupees:
          sumRupees(
            openFolioRows.map(
              folio =>
                folio.outstandingRupees,
            ),
          ),

        projectedRoomRevenueRupees:
          sumRupees(
            missingRoomNights.map(
              item =>
                item.projectedSubtotalRupees,
            ),
          ),

        projectedRoomTaxRupees:
          sumRupees(
            missingRoomNights.map(
              item =>
                item.projectedTaxRupees,
            ),
          ),

        projectedRoomTotalRupees:
          sumRupees(
            missingRoomNights.map(
              item =>
                item.projectedTotalRupees,
            ),
          ),

        postedRoomRevenueRupees:
          sumRupees(
            postedRoomNights.map(
              item =>
                item.existingSubtotalRupees,
            ),
          ),

        postedRoomTaxRupees:
          sumRupees(
            postedRoomNights.map(
              item =>
                item.existingTaxRupees,
            ),
          ),
      },

      pendingArrivals,

      pendingDepartures,

      roomNights,

      openFolios: openFolioRows,
    };
  }

  async close(
  c: ReservationContext,
) {
  guard(c);

  assertRoleCan(
    c.actor.role,
    'night_audit.run',
  );

  const db = getDb();

  return db.transaction(
    async tx => {
      /*
       * Only one Night Audit may operate
       * on a property at a time.
       */
      await tx.execute(
        sql`
          select pg_advisory_xact_lock(
            hashtext(
              ${`night-audit:${c.property.id}`}
            )
          )
        `,
      );

      const [property] = await tx
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
            eq(
              properties.active,
              true,
            ),
          ),
        )
        .limit(1)
        .for('update');

      if (!property) {
        throw new DomainError(
          'PROPERTY_NOT_FOUND',
          'The active property was not found.',
          404,
        );
      }

      const businessDate =
        property.businessDate;

      const calendarDate =
        propertyCalendarDate(
          property.timezone,
        );

      if (
        businessDate > calendarDate
      ) {
        throw new DomainError(
          'BUSINESS_DATE_IN_FUTURE',
          'Business date cannot be ahead of the property calendar date.',
          409,
        );
      }

      const [existingRun] =
        await tx
          .select()
          .from(nightAuditRuns)
          .where(
            and(
              eq(
                nightAuditRuns.organisationId,
                c.actor.organisationId,
              ),
              eq(
                nightAuditRuns.propertyId,
                c.property.id,
              ),
              eq(
                nightAuditRuns.businessDate,
                businessDate,
              ),
            ),
          )
          .limit(1);

      if (
        existingRun?.status ===
        'COMPLETED'
      ) {
        throw new DomainError(
          'NIGHT_AUDIT_ALREADY_COMPLETED',
          'Night Audit has already been completed for this business date.',
          409,
        );
      }

      const pendingArrivals =
        await tx
          .select({
            id: reservations.id,
          })
          .from(reservations)
          .where(
            and(
              eq(
                reservations.organisationId,
                c.actor.organisationId,
              ),
              eq(
                reservations.propertyId,
                c.property.id,
              ),
              inArray(
                reservations.status,
                [
                  'PENDING',
                  'HOLD',
                  'CONFIRMED',
                ],
              ),
              lte(
                reservations.arrivalDate,
                businessDate,
              ),
            ),
          );

      if (
        pendingArrivals.length > 0
      ) {
        throw new DomainError(
          'NIGHT_AUDIT_PENDING_ARRIVALS',
          `${pendingArrivals.length} arrival(s) must be resolved before closing ${businessDate}.`,
          409,
        );
      }

      const pendingDepartures =
        await tx
          .select({
            id: reservations.id,
          })
          .from(reservations)
          .where(
            and(
              eq(
                reservations.organisationId,
                c.actor.organisationId,
              ),
              eq(
                reservations.propertyId,
                c.property.id,
              ),
              eq(
                reservations.status,
                'CHECKED_IN',
              ),
              lte(
                reservations.departureDate,
                businessDate,
              ),
            ),
          );

      if (
        pendingDepartures.length > 0
      ) {
        throw new DomainError(
          'NIGHT_AUDIT_PENDING_DEPARTURES',
          `${pendingDepartures.length} departure(s) must be resolved before closing ${businessDate}.`,
          409,
        );
      }

      const roomNights =
        await tx
          .select({
            reservationId:
              reservations.id,

            reference:
              reservations.reference,

            roomId:
              reservations.roomId,

            roomNumber:
              rooms.number,

            nightlyRateRupees:
              reservations.nightlyRateRupees,

            taxRateBps:
              reservations.taxRateBps,

            folioId:
              folios.id,

            folioStatus:
              folios.status,
          })
          .from(reservations)
          .leftJoin(
            rooms,
            eq(
              rooms.id,
              reservations.roomId,
            ),
          )
          .leftJoin(
            folios,
            eq(
              folios.reservationId,
              reservations.id,
            ),
          )
          .where(
            and(
              eq(
                reservations.organisationId,
                c.actor.organisationId,
              ),
              eq(
                reservations.propertyId,
                c.property.id,
              ),
              eq(
                reservations.status,
                'CHECKED_IN',
              ),
              lte(
                reservations.arrivalDate,
                businessDate,
              ),
              gt(
                reservations.departureDate,
                businessDate,
              ),
            ),
          );

      const invalidRoomNight =
        roomNights.find(
          item =>
            !item.roomId ||
            !item.roomNumber ||
            !item.folioId ||
            ![
              'OPEN',
              'SETTLED',
            ].includes(
              item.folioStatus ?? '',
            ),
        );

      if (invalidRoomNight) {
        throw new DomainError(
          'NIGHT_AUDIT_IN_HOUSE_INVALID',
          `Reservation ${invalidRoomNight.reference} does not have a valid room and open financial folio.`,
          409,
        );
      }

      const timestamp =
        new Date().toISOString();

      const runId =
        existingRun?.id ??
        crypto.randomUUID();

      if (existingRun) {
        await tx
          .update(nightAuditRuns)
          .set({
            status:
              'IN_PROGRESS',

            attemptCount:
              existingRun.attemptCount +
              1,

            startedAt:
              timestamp,

            startedBy:
              c.actor.id,

            completedAt:
              null,

            completedBy:
              null,

            failureReason:
              null,
          })
          .where(
            eq(
              nightAuditRuns.id,
              existingRun.id,
            ),
          );
      } else {
        await tx
          .insert(nightAuditRuns)
          .values({
            id: runId,

            organisationId:
              c.actor.organisationId,

            propertyId:
              c.property.id,

            businessDate,

            status:
              'IN_PROGRESS',

            attemptCount:
              1,

            startedAt:
              timestamp,

            startedBy:
              c.actor.id,

            roomRevenueRupees:
              0,

            otherRevenueRupees:
              0,

            taxRupees:
              0,

            paymentsRupees:
              0,

            refundsRupees:
              0,

            outstandingRupees:
              0,

            roomNightsPosted:
              0,

            pendingArrivals:
              0,

            pendingDepartures:
              0,

            openFolios:
              0,
          });
      }

      const affectedFolios =
        new Set<string>();

      let postedNow = 0;

      for (
        const roomNight of roomNights
      ) {
        const folioId =
          roomNight.folioId!;

        const sourceId =
          `${roomNight.reservationId}:${businessDate}`;

        const taxRateBps =
          hotelAccommodationGstRateBps(
            roomNight.nightlyRateRupees,
            businessDate,
            roomNight.taxRateBps,
          );

        const values =
          calculateLine(
            1,
            roomNight.nightlyRateRupees,
            0,
            taxRateBps,
            (
              taxRateBps
                ? property.defaultTaxMode
                : 'EXEMPT'
            ) as TaxMode,
          );

        const inserted =
          await tx
            .insert(folioLines)
            .values({
              id:
                crypto.randomUUID(),

              organisationId:
                c.actor.organisationId,

              propertyId:
                c.property.id,

              folioId,

              description:
                `${businessDate} Room Charge`,

              category:
                'ROOM_CHARGE',

              quantity:
                1,

              unitAmountRupees:
                roomNight.nightlyRateRupees,

              taxRateBps,

              lineTotalRupees:
                values.totalRupees,

              ...values,

              source:
                'NIGHT_AUDIT',

              sourceType:
                'ROOM_NIGHT',

              sourceId,

              serviceDate:
                businessDate,

              postedBy:
                c.actor.id,

              createdAt:
                timestamp,
            })
            .onConflictDoNothing({
              target: [
                folioLines.propertyId,
                folioLines.sourceType,
                folioLines.sourceId,
              ],
            })
            .returning({
              id:
                folioLines.id,
            });

        if (inserted.length) {
          postedNow += 1;
        }

        affectedFolios.add(
          folioId,
        );
      }

      for (
        const folioId of affectedFolios
      ) {
        await recalculateAuditFolio(
          tx,
          c,
          folioId,
        );
      }

      /*
       * Build the financial snapshot after
       * all current-day room nights are posted.
       */
      const allLines =
        await tx
          .select()
          .from(folioLines)
          .where(
            and(
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

      const dailyLines =
        allLines.filter(line => {
          if (
            line.serviceDate ===
            businessDate
          ) {
            return true;
          }

          if (
            !line.serviceDate &&
            line.createdAt
          ) {
            return (
              localDateOf(
                line.createdAt,
                property.timezone,
              ) === businessDate
            );
          }

          return false;
        });

      const roomRevenueRupees =
        sumRupees(
          dailyLines
            .filter(
              line =>
                line.sourceType ===
                'ROOM_NIGHT',
            )
            .map(
              line =>
                line.taxableAmountRupees,
            ),
        );

      const otherRevenueRupees =
        sumRupees(
          dailyLines
            .filter(
              line =>
                line.sourceType !==
                'ROOM_NIGHT',
            )
            .map(
              line =>
                line.taxableAmountRupees,
            ),
        );

      const taxRupees =
        sumRupees(
          dailyLines.map(
            line =>
              line.taxRupees,
          ),
        );

      const paymentRows =
        await tx
          .select()
          .from(payments)
          .where(
            and(
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

      const paymentsRupees =
        sumRupees(
          paymentRows
            .filter(
              payment =>
                payment.status ===
                  'RECEIVED' &&
                localDateOf(
                  payment.receivedAt,
                  property.timezone,
                ) ===
                  businessDate,
            )
            .map(
              payment =>
                payment.amountRupees,
            ),
        );

      const refundRows =
        await tx
          .select()
          .from(paymentRefunds)
          .where(
            and(
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

      const refundsRupees =
        sumRupees(
          refundRows
            .filter(
              refund =>
                refund.status ===
                  'RECORDED' &&
                localDateOf(
                  refund.processedAt,
                  property.timezone,
                ) ===
                  businessDate,
            )
            .map(
              refund =>
                refund.amountRupees,
            ),
        );

      const openFolios =
        await tx
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
              eq(
                folios.status,
                'OPEN',
              ),
            ),
          );

      const outstandingRupees =
        sumRupees(
          openFolios.map(
            folio =>
              folio.outstandingRupees,
          ),
        );

      const businessDateRoomLines =
        dailyLines.filter(
          line =>
            line.sourceType ===
            'ROOM_NIGHT',
        );

      const nextDate =
        nextBusinessDate(
          businessDate,
        );

      const snapshot = {
        businessDate,
        nextBusinessDate:
          nextDate,

        roomNightsExpected:
          roomNights.length,

        roomNightsPosted:
          businessDateRoomLines.length,

        roomNightsPostedNow:
          postedNow,

        roomRevenueRupees,
        otherRevenueRupees,
        taxRupees,
        paymentsRupees,
        refundsRupees,
        outstandingRupees,

        openFolios:
          openFolios.length,

        completedAt:
          timestamp,

        completedBy:
          c.actor.id,
      };

      await tx
        .update(nightAuditRuns)
        .set({
          status:
            'COMPLETED',

          completedAt:
            timestamp,

          completedBy:
            c.actor.id,

          roomRevenueRupees,

          otherRevenueRupees,

          taxRupees,

          paymentsRupees,

          refundsRupees,

          outstandingRupees,

          roomNightsPosted:
            businessDateRoomLines.length,

          pendingArrivals:
            0,

          pendingDepartures:
            0,

          openFolios:
            openFolios.length,

          snapshot,

          failureReason:
            null,
        })
        .where(
          eq(
            nightAuditRuns.id,
            runId,
          ),
        );

      await tx
        .update(properties)
        .set({
          businessDate:
            nextDate,

          updatedAt:
            timestamp,

          version:
            sql`${properties.version} + 1`,
        })
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
            eq(
              properties.businessDate,
              businessDate,
            ),
          ),
        );

      await tx
        .insert(auditLogs)
        .values({
          id:
            crypto.randomUUID(),

          timestamp,

          actorId:
            c.actor.id,

          actorName:
            c.actor.name,

          role:
            c.actor.role,

          propertyId:
            c.property.id,

          deviceId:
            null,

          action:
            'NIGHT_AUDIT_CLOSED',

          entity:
            'NIGHT_AUDIT',

          entityId:
            runId,

          previousValue:
            JSON.stringify({
              businessDate,
            }),

          newValue:
            JSON.stringify(
              snapshot,
            ),

          source:
            'PRODUCTION_API',

          correlationId:
            crypto.randomUUID(),
        });

      return {
        id: runId,
        status:
          'COMPLETED',

        ...snapshot,
      };
    },
  );
 }
}