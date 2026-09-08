import { apiError, apiJson } from '@/lib/server/api-response';
import { requireReservationContext } from '@/lib/server/reservations/http';
import { productionReservationRepository } from '@/lib/server/reservations/repository';
import { ReservationService } from '@/lib/server/reservations/service';
import { entityIdSchema } from '@/lib/server/reservations/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const context = await requireReservationContext(request); const id = entityIdSchema.parse((await route.params).id); return apiJson({ items: await new ReservationService(productionReservationRepository()).history(context, id) }); }
  catch (error) { return apiError(error); }
}
