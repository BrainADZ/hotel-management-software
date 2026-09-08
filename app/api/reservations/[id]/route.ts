import { apiError, apiJson } from '@/lib/server/api-response';
import { requireReservationContext } from '@/lib/server/reservations/http';
import { productionReservationRepository } from '@/lib/server/reservations/repository';
import { ReservationService } from '@/lib/server/reservations/service';
import { entityIdSchema, reservationEditSchema } from '@/lib/server/reservations/validation';
export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, route: RouteContext) {
  try { const context = await requireReservationContext(request); const id = entityIdSchema.parse((await route.params).id); return apiJson(await new ReservationService(productionReservationRepository()).get(context, id)); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, route: RouteContext) {
  try { const context = await requireReservationContext(request); const id = entityIdSchema.parse((await route.params).id); const input = reservationEditSchema.parse(await request.json()); return apiJson(await new ReservationService(productionReservationRepository()).edit(context, id, input)); }
  catch (error) { return apiError(error); }
}
