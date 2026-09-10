import { and, asc, count, desc, eq, gt, ilike, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { DomainError } from '@hotel/shared/domain';
import { getDb } from '@/db';
import { auditLogs, guests, reservationEvents, reservationGuests, reservationSequences, reservations, rooms } from '@/db/schema';
import type { ReservationChanges, ReservationContext, ReservationEventRecord, ReservationRecord, ReservationRepository, ReservationStatus, ReservationSource, RoomRecord } from './types';

type Db = ReturnType<typeof getDb>;
type ReservationDb = Pick<Db, 'select' | 'insert' | 'update' | 'execute'>;
const blocking = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];

function rowSelection() {
  return { id: reservations.id, organisationId: reservations.organisationId, propertyId: reservations.propertyId, reference: reservations.reference,
    guestId: reservations.guestId, primaryGuestName: reservations.primaryGuestName, guestEmail: guests.email, guestPhone: guests.phone,
    roomId: reservations.roomId, roomNumber: rooms.number, roomType: reservations.roomType, arrivalDate: reservations.arrivalDate,
    departureDate: reservations.departureDate, adults: reservations.adults, children: reservations.children, status: reservations.status,
    source: reservations.source, sourceReference: reservations.sourceReference, nightlyRatePaise: reservations.nightlyRatePaise,
    taxRateBps: reservations.taxRateBps, estimatedTotalPaise: reservations.estimatedTotalPaise, specialRequests: reservations.specialRequests,
    internalNotes: reservations.internalNotes, holdUntil: reservations.holdUntil, cancellationReason: reservations.cancellationReason,
    cancelledAt: reservations.cancelledAt, cancelledBy: reservations.cancelledBy, noShowAt: reservations.noShowAt, noShowBy: reservations.noShowBy,
    createdBy: reservations.createdBy, updatedBy: reservations.updatedBy, createdAt: reservations.createdAt, updatedAt: reservations.updatedAt, version: reservations.version };
}
function normalize(row: Record<string, unknown>): ReservationRecord {
  return { ...row, status: row.status as ReservationStatus, source: row.source as ReservationSource } as ReservationRecord;
}
function scoped(context: ReservationContext) { return and(eq(reservations.organisationId, context.actor.organisationId), eq(reservations.propertyId, context.property.id)); }

function createRepository(database: ReservationDb, root: Db): ReservationRepository {
  const repository: ReservationRepository = {
    async atomic(key, work) {
      return root.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
        return work(createRepository(transaction as unknown as ReservationDb, root));
      });
    },
    async list(context, query) {
      const filters = [scoped(context)];
      if (query.status) filters.push(eq(reservations.status, query.status));
      if (query.arrivalDate) filters.push(eq(reservations.arrivalDate, query.arrivalDate));
      if (query.departureDate) filters.push(eq(reservations.departureDate, query.departureDate));
      if (query.source) filters.push(eq(reservations.source, query.source));
      if (query.room) filters.push(ilike(rooms.number, `%${query.room}%`));
      if (query.search) filters.push(or(ilike(reservations.reference, `%${query.search}%`), ilike(reservations.primaryGuestName, `%${query.search}%`), ilike(guests.email, `%${query.search}%`), ilike(guests.phone, `%${query.search}%`))!);
      const where = and(...filters);
      const [items, totals] = await Promise.all([
        database.select(rowSelection()).from(reservations).innerJoin(guests, eq(guests.id, reservations.guestId)).leftJoin(rooms, eq(rooms.id, reservations.roomId))
          .where(where).orderBy(desc(reservations.createdAt), desc(reservations.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
        database.select({ value: count() }).from(reservations).innerJoin(guests, eq(guests.id, reservations.guestId)).leftJoin(rooms, eq(rooms.id, reservations.roomId)).where(where),
      ]);
      return { items: items.map((row) => normalize(row)), page: query.page, pageSize: query.pageSize, total: totals[0]?.value ?? 0 };
    },
    async find(context, id) {
      const [row] = await database.select(rowSelection()).from(reservations).innerJoin(guests, eq(guests.id, reservations.guestId)).leftJoin(rooms, eq(rooms.id, reservations.roomId)).where(and(scoped(context), eq(reservations.id, id))).limit(1);
      return row ? normalize(row) : null;
    },
    async findRoom(context, id) {
      const [room] = await database.select({ id: rooms.id, propertyId: rooms.propertyId, number: rooms.number, roomType: rooms.roomType, baseRatePaise: rooms.baseRatePaise, active: rooms.active, operationalStatus: rooms.operationalStatus })
        .from(rooms).where(and(eq(rooms.propertyId, context.property.id), eq(rooms.id, id))).limit(1);
      return room as RoomRecord | undefined ?? null;
    },
    async conflicts(context, roomId, arrivalDate, departureDate, excludeId) {
      const filters = [scoped(context), eq(reservations.roomId, roomId), inArray(reservations.status, blocking), lt(reservations.arrivalDate, departureDate), gt(reservations.departureDate, arrivalDate)];
      if (excludeId) filters.push(ne(reservations.id, excludeId));
      const rowsFound = await database.select(rowSelection()).from(reservations).innerJoin(guests, eq(guests.id, reservations.guestId)).leftJoin(rooms, eq(rooms.id, reservations.roomId)).where(and(...filters));
      return rowsFound.map((row) => normalize(row));
    },
    async expiredHolds(context, before) {
      const rowsFound = await database.select(rowSelection()).from(reservations).innerJoin(guests, eq(guests.id, reservations.guestId)).leftJoin(rooms, eq(rooms.id, reservations.roomId))
        .where(and(scoped(context), eq(reservations.status, 'HOLD'), lt(reservations.holdUntil, before)));
      return rowsFound.map((row) => normalize(row));
    },
    async nextReference(context) {
      const [sequence] = await database.insert(reservationSequences).values({ propertyId: context.property.id, nextValue: 2 })
        .onConflictDoUpdate({ target: reservationSequences.propertyId, set: { nextValue: sql`${reservationSequences.nextValue} + 1` } }).returning({ value: reservationSequences.nextValue });
      const number = Math.max(1, (sequence?.value ?? 2) - 1); return `RES-${new Date().getUTCFullYear()}-${String(number).padStart(6, '0')}`;
    },
    async create(context, input) {
      const guestId = crypto.randomUUID();
      await database.insert(guests).values({ id: guestId, organisationId: context.actor.organisationId, propertyId: context.property.id, firstName: input.guestName, displayName: input.guestName, fullName: input.guestName, email: input.email || null, phone: input.phone || null,
        city: null, preferences: null, dietaryRequirements: null, loyaltyTier: null, createdAt: input.now, updatedAt: input.now });
      await database.insert(reservations).values({ id: input.id, organisationId: context.actor.organisationId, propertyId: context.property.id, reference: input.reference,
        guestId, primaryGuestName: input.guestName, roomId: input.roomId, roomType: input.roomType, arrivalDate: input.arrivalDate, departureDate: input.departureDate,
        adults: input.adults, children: input.children, status: input.status, source: input.source, sourceReference: input.sourceReference || null,
        nightlyRatePaise: input.nightlyRatePaise, taxRateBps: input.taxRateBps, estimatedTotalPaise: input.estimatedTotalPaise,
        specialRequests: input.specialRequests || null, internalNotes: input.internalNotes || null, holdUntil: input.holdUntil || null,
        totalAmountPaise: input.estimatedTotalPaise, balancePaise: input.estimatedTotalPaise, createdWhilePropertyOffline: false, contactStatus: 'ACKNOWLEDGED',
        createdBy: context.actor.id, updatedBy: context.actor.id, createdAt: input.now, updatedAt: input.now });
      await database.insert(reservationGuests).values({ id: crypto.randomUUID(), organisationId: context.actor.organisationId, propertyId: context.property.id, reservationId: input.id, guestId, guestRole: 'PRIMARY', createdAt: input.now });
      const result = await repository.find(context, input.id); if (!result) throw new Error('Reservation insert did not return a record.'); return result;
    },
    async update(context, reservation, changes, now) {
      if (changes.guestName !== undefined || changes.email !== undefined || changes.phone !== undefined) {
        await database.update(guests).set({ fullName: changes.guestName, email: changes.email, phone: changes.phone, updatedAt: now }).where(and(eq(guests.id, reservation.guestId), eq(guests.propertyId, context.property.id)));
      }
      const reservationChanges: ReservationChanges = { ...changes };
      delete reservationChanges.guestName; delete reservationChanges.email; delete reservationChanges.phone;
      const values = { ...reservationChanges, primaryGuestName: changes.guestName, updatedBy: context.actor.id, updatedAt: now, version: reservation.version + 1 };
      await database.update(reservations).set(values).where(and(scoped(context), eq(reservations.id, reservation.id), eq(reservations.version, reservation.version)));
      const result = await repository.find(context, reservation.id); if (!result || result.version !== reservation.version + 1) throw new DomainError('CONCURRENT_RESERVATION_UPDATE', 'The reservation changed while you were editing it. Reload and try again.', 409); return result;
    },
    async addEvent(context, reservation, eventType, previousStatus, metadata) {
      const now = new Date().toISOString();
      await database.insert(reservationEvents).values({ id: crypto.randomUUID(), organisationId: context.actor.organisationId, propertyId: context.property.id,
        reservationId: reservation.id, eventType, previousStatus, newStatus: reservation.status, performedBy: context.actor.id, metadata: metadata ?? null, createdAt: now });
      await database.insert(auditLogs).values({ id: crypto.randomUUID(), timestamp: now, actorId: context.actor.id, actorName: context.actor.name, role: context.actor.role,
        propertyId: context.property.id, deviceId: null, action: eventType, entity: 'RESERVATION', entityId: reservation.id, previousValue: previousStatus,
        newValue: reservation.status, source: 'PRODUCTION_API', correlationId: crypto.randomUUID() });
    },
    async history(context, reservationId) {
      const found = await database.select({ id: reservationEvents.id, eventType: reservationEvents.eventType, previousStatus: reservationEvents.previousStatus,
        newStatus: reservationEvents.newStatus, performedBy: reservationEvents.performedBy, metadata: reservationEvents.metadata, createdAt: reservationEvents.createdAt })
        .from(reservationEvents).where(and(eq(reservationEvents.organisationId, context.actor.organisationId), eq(reservationEvents.propertyId, context.property.id), eq(reservationEvents.reservationId, reservationId))).orderBy(asc(reservationEvents.createdAt), asc(reservationEvents.id));
      return found.map((event) => ({ ...event, eventType: event.eventType as ReservationEventRecord['eventType'], previousStatus: event.previousStatus as ReservationStatus | null,
        newStatus: event.newStatus as ReservationStatus | null, metadata: event.metadata ?? null }));
    },
  };
  return repository;
}

export function productionReservationRepository(): ReservationRepository {
  const database = getDb(); return createRepository(database, database);
}
