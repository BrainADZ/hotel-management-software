import { listRooms } from '@/services/rooms/service';
import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { roleCan } from '@hotel/shared/domain';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const context = await requireReservationContext(request);
    const items = (await listRooms(context)).map(room => roleCan(context.actor.role,'reservation.read') ? room : { id:room.id, number:room.number, roomType:room.roomType, operationalStatus:room.operationalStatus });
    return apiJson({ items });
  } catch (error) { return apiError(error); }
}
