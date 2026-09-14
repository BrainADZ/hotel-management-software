import {
  and,
  asc,
  count,
  eq,
  gt,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
  auditLogs,
  guestIdentityDocuments,
  guests,
  housekeepingTasks,
  properties,
  reservationEvents,
  reservations,
  rooms,
  stayKeyIssues,
  stays,
} from '@/db/schema';
import { getDb } from '@/db';
import { DomainError, assertRoleCan, roleCan } from '@hotel/shared/domain';
import type { ReservationContext } from '@/services/reservations/types';
import { reservationBlocksAvailability } from '@/services/reservations/availability';
import {
  assignRoomSchema,
  checkInSchema,
  frontDeskListSchema,
  keyIssueSchema,
  lateCheckoutSchema,
  roomMoveSchema,
} from './validation';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const terminal = ['CANCELLED', 'CHECKED_OUT', 'NO_SHOW'];

function guard(
  c: ReservationContext,
  permission:
    | 'frontdesk.view'
    | 'frontdesk.assign_room'
    | 'frontdesk.checkin'
    | 'frontdesk.room_move'
    | 'frontdesk.late_checkout'
    | 'frontdesk.override',
) {
  assertRoleCan(c.actor.role, permission);

  if (
    c.actor.organisationId !== c.property.organisationId ||
    c.actor.propertyId !== c.property.id
  ) {
    throw new DomainError(
      'PROPERTY_ACCESS_DENIED',
      'An active property context is required.',
      403,
    );
  }
}

function propertyDate(timezone: string, now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function plannedPropertyTime(
  date: string,
  time: string,
  timezone: string,
) {
  const midday = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(midday);

  const raw =
    parts
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00';

  const match = raw.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  const offset = match
    ? `${match[1]}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`
    : '+00:00';

  const result = new Date(`${date}T${time}:00${offset}`);

  if (!Number.isFinite(result.getTime())) {
    throw new DomainError(
      'INVALID_PROPERTY_TIME',
      'Property check-in or checkout time is invalid.',
      500,
    );
  }

  return result.toISOString();
}

async function policy(db: Db | Tx, c: ReservationContext) {
  return (
    await db
      .select({
        checkInTime: properties.checkInTime,
        checkOutTime: properties.checkOutTime,
        kycRequired: properties.kycRequired,
      })
      .from(properties)
      .where(
        and(
          eq(properties.id, c.property.id),
          eq(properties.organisationId, c.actor.organisationId),
        ),
      )
      .limit(1)
  )[0];
}

async function event(
  db: Db | Tx,
  c: ReservationContext,
  r: { id: string; status: string },
  type: string,
  previous: string | null,
  metadata?: Record<string, unknown>,
) {
  const now = new Date().toISOString();

  await db.insert(reservationEvents).values({
    id: crypto.randomUUID(),
    organisationId: c.actor.organisationId,
    propertyId: c.property.id,
    reservationId: r.id,
    eventType: type,
    previousStatus: previous,
    newStatus: r.status,
    performedBy: c.actor.id,
    metadata: metadata ?? null,
    createdAt: now,
  });

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    timestamp: now,
    actorId: c.actor.id,
    actorName: c.actor.name,
    role: c.actor.role,
    propertyId: c.property.id,
    deviceId: null,
    action: type,
    entity: 'RESERVATION',
    entityId: r.id,
    previousValue: previous,
    newValue: r.status,
    source: 'PRODUCTION_API',
    correlationId: crypto.randomUUID(),
  });
}

async function reservation(
  db: Db | Tx,
  c: ReservationContext,
  id: string,
) {
  const row = (
    await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, id),
          eq(reservations.organisationId, c.actor.organisationId),
          eq(reservations.propertyId, c.property.id),
        ),
      )
      .limit(1)
  )[0];

  if (!row) {
    throw new DomainError(
      'RESERVATION_NOT_FOUND',
      'Reservation was not found.',
      404,
    );
  }

  return row;
}

async function room(db: Db | Tx, c: ReservationContext, id: string) {
  const row = (
    await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.propertyId, c.property.id)))
      .limit(1)
  )[0];

  if (!row || !row.active) {
    throw new DomainError(
      'ROOM_NOT_AVAILABLE',
      'Room is unavailable for this property.',
      409,
    );
  }

  return row;
}

async function available(
  db: Db | Tx,
  c: ReservationContext,
  r: Awaited<ReturnType<typeof reservation>>,
  roomId: string,
) {
  const conflicts = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.propertyId, c.property.id),
        eq(reservations.roomId, roomId),
        ne(reservations.id, r.id),
        sql`${reservations.arrivalDate} < ${r.departureDate}`,
        sql`${reservations.departureDate} > ${r.arrivalDate}`,
      ),
    );

  return !conflicts.some((item) =>
    reservationBlocksAvailability(
      {
        ...item,
        guestEmail: null,
        guestPhone: null,
        roomNumber: null,
      } as never,
      new Date(),
    ),
  );
}

export class FrontDeskService {
  constructor(private clock: () => Date = () => new Date()) {}

  async list(c: ReservationContext, raw: unknown) {
    guard(c, 'frontdesk.view');

    const q = frontDeskListSchema.parse(raw);
    const date = q.date ?? propertyDate(c.property.timezone, this.clock());

    let where = and(
      eq(reservations.organisationId, c.actor.organisationId),
      eq(reservations.propertyId, c.property.id),
    );

    if (q.view === 'arrivals') {
      where = and(
        where,
        eq(reservations.arrivalDate, date),
        inArray(reservations.status, ['CONFIRMED', 'PENDING', 'HOLD']),
      );
    } else if (q.view === 'expected') {
      where = and(
        where,
        gt(reservations.arrivalDate, date),
        inArray(reservations.status, ['CONFIRMED', 'PENDING', 'HOLD']),
      );
    } else if (q.view === 'checked-in' || q.view === 'in-house') {
      where = and(where, eq(reservations.status, 'CHECKED_IN'));
    } else if (q.view === 'departures') {
      where = and(
        where,
        eq(reservations.departureDate, date),
        eq(reservations.status, 'CHECKED_IN'),
      );
    } else {
      where = and(
        where,
        eq(reservations.arrivalDate, date),
        eq(reservations.status, 'NO_SHOW'),
      );
    }

    if (q.search) {
      where = and(
        where,
        or(
          ilike(reservations.reference, `%${q.search}%`),
          ilike(reservations.primaryGuestName, `%${q.search}%`),
          ilike(rooms.number, `%${q.search}%`),
        ),
      );
    }

    const db = getDb();
    const base = db
      .select({
        id: reservations.id,
        reference: reservations.reference,
        guestId: reservations.guestId,
        guestName: reservations.primaryGuestName,
        roomId: reservations.roomId,
        roomNumber: rooms.number,
        roomType: reservations.roomType,
        arrivalDate: reservations.arrivalDate,
        departureDate: reservations.departureDate,
        status: reservations.status,
        source: reservations.source,
        specialRequests: reservations.specialRequests,
        phone: guests.phone,
        email: guests.email,
        roomOperationalStatus: rooms.operationalStatus,
        roomOccupancyStatus: rooms.occupancyStatus,
      })
      .from(reservations)
      .leftJoin(rooms, eq(reservations.roomId, rooms.id))
      .leftJoin(guests, eq(reservations.guestId, guests.id));

    const items = await base
      .where(where)
      .orderBy(asc(reservations.arrivalDate), asc(reservations.primaryGuestName))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const total =
      (
        await db
          .select({ value: count() })
          .from(reservations)
          .leftJoin(rooms, eq(reservations.roomId, rooms.id))
          .where(where)
      )[0]?.value ?? 0;

    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      date,
    };
  }

  async assignRoom(c: ReservationContext, id: string, raw: unknown) {
    guard(c, 'frontdesk.assign_room');

    const input = assignRoomSchema.parse(raw);

    return getDb().transaction(async (tx) => {
      const r = await reservation(tx, c, id);

      if (terminal.includes(r.status)) {
        throw new DomainError(
          'INVALID_CHECKIN_STATUS',
          'Room cannot be assigned in this reservation status.',
          409,
        );
      }

      const target = await room(tx, c, input.roomId);

      if (
        ['OUT_OF_ORDER', 'OUT_OF_SERVICE', 'MAINTENANCE'].includes(
          target.operationalStatus,
        ) ||
        target.occupancyStatus === 'OCCUPIED' ||
        !(await available(tx, c, r, target.id))
      ) {
        throw new DomainError(
          'ROOM_NOT_AVAILABLE',
          'The selected room is unavailable.',
          409,
        );
      }

      const old = r.roomId;
      const updatedAt = this.clock().toISOString();

      await tx
        .update(reservations)
        .set({
          roomId: target.id,
          roomType: target.roomType,
          updatedBy: c.actor.id,
          updatedAt,
          version: r.version + 1,
        })
        .where(and(eq(reservations.id, r.id), eq(reservations.version, r.version)));

      const updated = {
        ...r,
        roomId: target.id,
        roomType: target.roomType,
      };

      await event(tx, c, updated, 'ROOM_ASSIGNED', r.status, {
        oldRoomId: old,
        newRoomId: target.id,
      });

      return updated;
    });
  }

  async checkIn(c: ReservationContext, id: string, raw: unknown) {
    guard(c, 'frontdesk.checkin');

    const input = checkInSchema.parse(raw);

    return getDb().transaction(async (tx) => {
      const r = await reservation(tx, c, id);

      if (!['CONFIRMED', 'PENDING'].includes(r.status)) {
        throw new DomainError(
          'INVALID_CHECKIN_STATUS',
          'Reservation is not eligible for check-in.',
          409,
        );
      }

      if (!r.roomId) {
        throw new DomainError(
          'ROOM_NOT_ASSIGNED',
          'Assign a room before check-in.',
          409,
        );
      }

      const target = await room(tx, c, r.roomId);

      if (
        !(await available(tx, c, r, target.id)) ||
        target.occupancyStatus === 'OCCUPIED'
      ) {
        throw new DomainError(
          'ROOM_NOT_AVAILABLE',
          'Assigned room is unavailable.',
          409,
        );
      }

      if (
        ['OUT_OF_ORDER', 'OUT_OF_SERVICE', 'MAINTENANCE'].includes(
          target.operationalStatus,
        )
      ) {
        throw new DomainError(
          'ROOM_OUT_OF_ORDER',
          'Assigned room is out of service.',
          409,
        );
      }

      const dirty = ['DIRTY', 'VACANT_DIRTY'].includes(
        target.operationalStatus,
      );

      if (
        dirty &&
        !(input.overrideDirty && roleCan(c.actor.role, 'frontdesk.override'))
      ) {
        throw new DomainError(
          'ROOM_NOT_CLEAN',
          'Assigned room is not clean.',
          409,
        );
      }

      const g = (
        await tx
          .select()
          .from(guests)
          .where(
            and(
              eq(guests.id, r.guestId),
              eq(guests.organisationId, c.actor.organisationId),
              eq(guests.propertyId, c.property.id),
            ),
          )
          .limit(1)
      )[0];

      if (!g?.fullName || !g.phone) {
        throw new DomainError(
          'GUEST_DETAILS_INCOMPLETE',
          'Guest name and phone are required.',
          409,
        );
      }

      const p = await policy(tx, c);

      if (p?.kycRequired) {
        const verified = await tx
          .select({ id: guestIdentityDocuments.id })
          .from(guestIdentityDocuments)
          .where(
            and(
              eq(guestIdentityDocuments.guestId, r.guestId),
              eq(
                guestIdentityDocuments.organisationId,
                c.actor.organisationId,
              ),
              eq(guestIdentityDocuments.propertyId, c.property.id),
              eq(guestIdentityDocuments.verified, true),
            ),
          )
          .limit(1);

        if (!verified.length) {
          throw new DomainError(
            'KYC_REQUIRED',
            'Verified guest identity metadata is required.',
            409,
          );
        }
      }

      const now = this.clock();
      const plannedIn = plannedPropertyTime(
        r.arrivalDate,
        p?.checkInTime ?? '14:00',
        c.property.timezone,
      );
      const early = now < new Date(plannedIn);

      if (
        early &&
        !(input.earlyCheckInOverride &&
          roleCan(c.actor.role, 'frontdesk.override'))
      ) {
        throw new DomainError(
          'CHECKIN_TOO_EARLY',
          `Check-in starts at ${p?.checkInTime ?? '14:00'} property time.`,
          409,
        );
      }

      const nowIso = now.toISOString();
      const stayId = crypto.randomUUID();

      await tx
        .update(reservations)
        .set({
          status: 'CHECKED_IN',
          updatedBy: c.actor.id,
          updatedAt: nowIso,
          version: r.version + 1,
        })
        .where(and(eq(reservations.id, r.id), eq(reservations.version, r.version)));

      await tx
        .update(rooms)
        .set({
          occupancyStatus: 'OCCUPIED',
          operationalStatus: 'CLEAN',
          updatedAt: nowIso,
          version: target.version + 1,
        })
        .where(and(eq(rooms.id, target.id), eq(rooms.version, target.version)));

      await tx.insert(stays).values({
        id: stayId,
        organisationId: c.actor.organisationId,
        propertyId: c.property.id,
        reservationId: r.id,
        guestId: r.guestId,
        roomId: target.id,
        status: 'IN_HOUSE',
        plannedCheckInAt: plannedIn,
        plannedCheckOutAt: plannedPropertyTime(
          r.departureDate,
          p?.checkOutTime ?? '11:00',
          c.property.timezone,
        ),
        actualCheckInAt: nowIso,
        checkedInBy: c.actor.id,
        earlyCheckIn: early,
        earlyCheckInOverride: early && input.earlyCheckInOverride,
        notes: input.stayNotes,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      for (const key of input.keys) {
        await tx.insert(stayKeyIssues).values({
          id: crypto.randomUUID(),
          organisationId: c.actor.organisationId,
          propertyId: c.property.id,
          stayId,
          keyType: key.keyType,
          keyLabel: key.keyLabel,
          quantity: key.quantity,
          status: 'ISSUED',
          issuedAt: nowIso,
          issuedBy: c.actor.id,
        });
      }

      const updated = {
        ...r,
        status: 'CHECKED_IN',
      };

      if (early) {
        await event(tx, c, updated, 'EARLY_CHECKIN_OVERRIDE', r.status, {
          plannedCheckInAt: plannedIn,
        });
      }

      await event(tx, c, updated, 'CHECKED_IN', r.status, {
        stayId,
        roomId: target.id,
        earlyCheckIn: early,
      });

      return {
        reservation: updated,
        stayId,
      };
    });
  }

  async moveRoom(c: ReservationContext, stayId: string, raw: unknown) {
    guard(c, 'frontdesk.room_move');

    const input = roomMoveSchema.parse(raw);

    return getDb().transaction(async (tx) => {
      const stay = (
        await tx
          .select()
          .from(stays)
          .where(
            and(
              eq(stays.id, stayId),
              eq(stays.organisationId, c.actor.organisationId),
              eq(stays.propertyId, c.property.id),
              eq(stays.status, 'IN_HOUSE'),
            ),
          )
          .limit(1)
      )[0];

      if (!stay) {
        throw new DomainError(
          'STAY_NOT_FOUND',
          'Active stay was not found.',
          404,
        );
      }

      const r = await reservation(tx, c, stay.reservationId);
      const oldRoom = await room(tx, c, stay.roomId);
      const targetRoom = await room(tx, c, input.roomId);

      if (targetRoom.id === oldRoom.id) {
        throw new DomainError(
          'ROOM_MOVE_SAME_ROOM',
          'Choose a different destination room.',
          409,
        );
      }

      if (
        targetRoom.occupancyStatus === 'OCCUPIED' ||
        !['READY', 'CLEAN', 'VACANT_CLEAN'].includes(
          targetRoom.operationalStatus,
        ) ||
        !(await available(tx, c, r, targetRoom.id))
      ) {
        throw new DomainError(
          'ROOM_NOT_AVAILABLE',
          'Destination room must be clean and available.',
          409,
        );
      }

      const now = this.clock().toISOString();

      await tx
        .update(rooms)
        .set({
          occupancyStatus: 'VACANT',
          operationalStatus: 'VACANT_DIRTY',
          updatedAt: now,
          version: oldRoom.version + 1,
        })
        .where(and(eq(rooms.id, oldRoom.id), eq(rooms.version, oldRoom.version)));

      await tx
        .update(housekeepingTasks)
        .set({
          status: 'CANCELLED',
          updatedAt: now,
          version: sql`${housekeepingTasks.version} + 1`,
          notes:
            'Cancelled automatically because the guest moved to another room.',
        })
        .where(
          and(
            eq(housekeepingTasks.propertyId, c.property.id),
            eq(housekeepingTasks.roomId, oldRoom.id),
            eq(housekeepingTasks.reservationId, r.id),
            eq(housekeepingTasks.taskType, 'STAY_SERVICE'),
            inArray(housekeepingTasks.status, [
              'UNASSIGNED',
              'ASSIGNED',
              'PENDING',
              'DEFERRED',
            ]),
          ),
        );

      const existingCleaning = await tx
        .select({ id: housekeepingTasks.id })
        .from(housekeepingTasks)
        .where(
          and(
            eq(housekeepingTasks.propertyId, c.property.id),
            eq(housekeepingTasks.roomId, oldRoom.id),
            eq(housekeepingTasks.taskType, 'CHECKOUT_CLEANING'),
            inArray(housekeepingTasks.status, [
              'UNASSIGNED',
              'ASSIGNED',
              'PENDING',
              'DEFERRED',
            ]),
          ),
        )
        .limit(1);

      let housekeepingTaskId: string | null = null;

      if (existingCleaning.length) {
        housekeepingTaskId = existingCleaning[0].id;
      } else {
        housekeepingTaskId = crypto.randomUUID();

        await tx.insert(housekeepingTasks).values({
          id: housekeepingTaskId,
          propertyId: c.property.id,
          roomId: oldRoom.id,
          reservationId: null,
          assignedUserId: null,
          assignedTo: null,
          taskType: 'CHECKOUT_CLEANING',
          priority: 'HIGH',
          status: 'UNASSIGNED',
          scheduledAt: now,
          updatedAt: now,
          version: 1,
          notes: `Vacant-room cleaning after room move from ${r.reference}.`,
        });
      }

      await tx
        .update(rooms)
        .set({
          occupancyStatus: 'OCCUPIED',
          operationalStatus: 'CLEAN',
          updatedAt: now,
          version: targetRoom.version + 1,
        })
        .where(
          and(eq(rooms.id, targetRoom.id), eq(rooms.version, targetRoom.version)),
        );

      await tx
        .update(stays)
        .set({
          roomId: targetRoom.id,
          updatedAt: now,
          version: stay.version + 1,
        })
        .where(and(eq(stays.id, stay.id), eq(stays.version, stay.version)));

      await tx
        .update(reservations)
        .set({
          roomId: targetRoom.id,
          roomType: targetRoom.roomType,
          updatedBy: c.actor.id,
          updatedAt: now,
          version: r.version + 1,
        })
        .where(and(eq(reservations.id, r.id), eq(reservations.version, r.version)));

      await event(tx, c, r, 'ROOM_MOVED', r.status, {
        oldRoomId: oldRoom.id,
        newRoomId: targetRoom.id,
        reason: input.reason,
        housekeepingTaskId,
      });

      return {
        stayId,
        oldRoomId: oldRoom.id,
        newRoomId: targetRoom.id,
        housekeepingTaskId,
      };
    });
  }

  async lateCheckout(c: ReservationContext, stayId: string, raw: unknown) {
    guard(c, 'frontdesk.late_checkout');

    const input = lateCheckoutSchema.parse(raw);
    const now = this.clock().toISOString();
    const db = getDb();

    const stay = (
      await db
        .select()
        .from(stays)
        .where(
          and(
            eq(stays.id, stayId),
            eq(stays.organisationId, c.actor.organisationId),
            eq(stays.propertyId, c.property.id),
          ),
        )
        .limit(1)
    )[0];

    if (!stay) {
      throw new DomainError('STAY_NOT_FOUND', 'Stay was not found.', 404);
    }

    if (input.action !== 'REQUEST' && !['OWNER', 'MANAGER'].includes(c.actor.role)) {
      throw new DomainError(
        'FORBIDDEN',
        'Only an owner or manager can decide late checkout.',
        403,
      );
    }

    const status =
      input.action === 'REQUEST'
        ? 'REQUESTED'
        : input.action === 'APPROVE'
          ? 'APPROVED'
          : 'REJECTED';

    await db
      .update(stays)
      .set(
        input.action === 'REQUEST'
          ? {
              lateCheckoutStatus: status,
              lateCheckoutRequestedUntil: input.requestedUntil,
              lateCheckoutRequestedAt: now,
              lateCheckoutRequestedBy: c.actor.id,
              updatedAt: now,
            }
          : {
              lateCheckoutStatus: status,
              lateCheckoutDecidedAt: now,
              lateCheckoutDecidedBy: c.actor.id,
              lateCheckoutDecisionNote: input.note,
              updatedAt: now,
            },
      )
      .where(eq(stays.id, stay.id));

    const r = await reservation(db, c, stay.reservationId);

    await event(db, c, r, `LATE_CHECKOUT_${status}`, r.status, {
      requestedUntil:
        input.action === 'REQUEST'
          ? input.requestedUntil
          : stay.lateCheckoutRequestedUntil,
      note: input.note,
    });

    return {
      stayId,
      status,
    };
  }

  async issueKey(c: ReservationContext, stayId: string, raw: unknown) {
    guard(c, 'frontdesk.checkin');

    const input = keyIssueSchema.parse(raw);
    const db = getDb();

    const stay = (
      await db
        .select()
        .from(stays)
        .where(
          and(
            eq(stays.id, stayId),
            eq(stays.organisationId, c.actor.organisationId),
            eq(stays.propertyId, c.property.id),
            eq(stays.status, 'IN_HOUSE'),
          ),
        )
        .limit(1)
    )[0];

    if (!stay) {
      throw new DomainError(
        'STAY_NOT_FOUND',
        'Active stay was not found.',
        404,
      );
    }

    const id = crypto.randomUUID();

    await db.insert(stayKeyIssues).values({
      id,
      organisationId: c.actor.organisationId,
      propertyId: c.property.id,
      stayId,
      keyType: input.keyType,
      keyLabel: input.keyLabel,
      quantity: input.quantity,
      status: 'ISSUED',
      issuedAt: this.clock().toISOString(),
      issuedBy: c.actor.id,
      notes: input.notes,
    });

    return { id };
  }

  async checkOut(c: ReservationContext, id: string) {
    guard(c, 'frontdesk.checkin');

    return getDb().transaction(async (tx) => {
      const r = await reservation(tx, c, id);

      if (r.status !== 'CHECKED_IN' || !r.roomId) {
        throw new DomainError(
          'INVALID_CHECKIN_STATUS',
          'Reservation is not checked in.',
          409,
        );
      }

      const stay = (
        await tx
          .select()
          .from(stays)
          .where(
            and(
              eq(stays.reservationId, r.id),
              eq(stays.organisationId, c.actor.organisationId),
              eq(stays.propertyId, c.property.id),
              eq(stays.status, 'IN_HOUSE'),
            ),
          )
          .limit(1)
      )[0];

      if (!stay) {
        throw new DomainError(
          'STAY_NOT_FOUND',
          'Active stay was not found.',
          404,
        );
      }

      const occupied = await room(tx, c, r.roomId);
      const now = this.clock().toISOString();

      await tx
        .update(reservations)
        .set({
          status: 'CHECKED_OUT',
          updatedBy: c.actor.id,
          updatedAt: now,
          version: r.version + 1,
        })
        .where(and(eq(reservations.id, r.id), eq(reservations.version, r.version)));

      await tx
        .update(stays)
        .set({
          status: 'CHECKED_OUT',
          actualCheckOutAt: now,
          checkedOutBy: c.actor.id,
          updatedAt: now,
          version: stay.version + 1,
        })
        .where(and(eq(stays.id, stay.id), eq(stays.version, stay.version)));

      await tx
        .update(rooms)
        .set({
          occupancyStatus: 'VACANT',
          operationalStatus: 'VACANT_DIRTY',
          updatedAt: now,
          version: occupied.version + 1,
        })
        .where(and(eq(rooms.id, occupied.id), eq(rooms.version, occupied.version)));

      await tx
        .insert(housekeepingTasks)
        .values({
          id: crypto.randomUUID(),
          propertyId: c.property.id,
          roomId: occupied.id,
          reservationId: r.id,
          taskType: 'CHECKOUT_CLEANING',
          priority: 'HIGH',
          status: 'UNASSIGNED',
          scheduledAt: now,
          updatedAt: now,
          version: 1,
          notes: 'Post-checkout cleaning',
        })
        .onConflictDoNothing();

      await event(
        tx,
        c,
        { ...r, status: 'CHECKED_OUT' },
        'CHECKED_OUT',
        r.status,
        {
          stayId: stay.id,
          roomId: occupied.id,
        },
      );

      return {
        reservationId: r.id,
        stayId: stay.id,
      };
    });
  }
}
