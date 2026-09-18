import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rooms } from '@/db/schema';
import type { ReservationContext } from '../reservations/types';
export async function listRooms(context: ReservationContext) {
  return getDb().select({ id: rooms.id, number: rooms.number, roomType: rooms.roomType, baseRateRupees: rooms.baseRateRupees,
    occupancyStatus: rooms.occupancyStatus, floor: rooms.floor, version: rooms.version,
    operationalStatus: rooms.operationalStatus }).from(rooms).where(and(eq(rooms.propertyId, context.property.id), eq(rooms.active, true)));
}
