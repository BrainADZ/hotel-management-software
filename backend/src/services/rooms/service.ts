import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rooms } from '@/db/schema';
import type { ReservationContext } from '../reservations/types';
export async function listRooms(context: ReservationContext) {
  return getDb().select({ id: rooms.id, number: rooms.number, roomType: rooms.roomType, baseRatePaise: rooms.baseRatePaise,
    operationalStatus: rooms.operationalStatus }).from(rooms).where(and(eq(rooms.propertyId, context.property.id), eq(rooms.active, true)));
}
