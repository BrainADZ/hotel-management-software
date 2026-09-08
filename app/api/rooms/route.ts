import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rooms } from '@/db/schema';
import { apiError, apiJson } from '@/lib/server/api-response';
import { requireReservationContext } from '@/lib/server/reservations/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const context = await requireReservationContext(request);
    const items = await getDb().select({ id: rooms.id, number: rooms.number, roomType: rooms.roomType, baseRatePaise: rooms.baseRatePaise,
      operationalStatus: rooms.operationalStatus }).from(rooms).where(and(eq(rooms.propertyId, context.property.id), eq(rooms.active, true)));
    return apiJson({ items });
  } catch (error) { return apiError(error); }
}
