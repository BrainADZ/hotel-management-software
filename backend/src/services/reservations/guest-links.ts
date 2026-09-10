import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { guests, reservationGuests, reservations } from '@/db/schema';
import { assertRoleCan, DomainError } from '@hotel/shared/domain';
import type { ReservationContext } from './types';

async function scopedReservation(context: ReservationContext, reservationId: string) {
  const db = getDb();
  const reservation = (await db.select({ id: reservations.id }).from(reservations).where(and(
    eq(reservations.id, reservationId), eq(reservations.organisationId, context.actor.organisationId),
    eq(reservations.propertyId, context.property.id),
  )).limit(1))[0];
  if (!reservation) throw new DomainError('RESERVATION_NOT_FOUND', 'Reservation was not found.', 404);
  return db;
}
export async function listReservationGuests(context: ReservationContext, reservationId: string) {
  const db = await scopedReservation(context, reservationId);
  assertRoleCan(context.actor.role, 'guest.view');
  return db.select({ id: reservationGuests.id, guestRole: reservationGuests.guestRole, guestId: guests.id,
    displayName: guests.displayName, phone: guests.phone, email: guests.email }).from(reservationGuests)
    .innerJoin(guests, eq(guests.id, reservationGuests.guestId)).where(and(
      eq(reservationGuests.reservationId, reservationId), eq(reservationGuests.organisationId, context.actor.organisationId),
      eq(reservationGuests.propertyId, context.property.id),
    ));
}
export async function linkReservationGuest(context: ReservationContext, reservationId: string, readGuestId: () => Promise<string>) {
  const db = await scopedReservation(context, reservationId);
  assertRoleCan(context.actor.role, 'guest.edit');
  // Read input after access checks to preserve the original validation/error order.
  const guestId = await readGuestId();
  const guest = (await db.select({ id: guests.id }).from(guests).where(and(eq(guests.id, guestId),
    eq(guests.organisationId, context.actor.organisationId), eq(guests.propertyId, context.property.id))).limit(1))[0];
  if (!guest) throw new DomainError('GUEST_NOT_FOUND', 'Guest was not found.', 404);
  await db.insert(reservationGuests).values({ id: crypto.randomUUID(), organisationId: context.actor.organisationId,
    propertyId: context.property.id, reservationId, guestId, guestRole: 'ACCOMPANYING', createdAt: new Date().toISOString(),
  }).onConflictDoNothing();
  return { linked: true };
}
