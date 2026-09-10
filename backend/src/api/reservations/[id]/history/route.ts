import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { productionReservationRepository } from '@/services/reservations/repository';
import { ReservationService } from '@/services/reservations/service';
import { entityIdSchema } from '@/services/reservations/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const context = await requireReservationContext(request); const id = entityIdSchema.parse((await route.params).id); return apiJson({ items: await new ReservationService(productionReservationRepository()).history(context, id) }); }
  catch (error) { return apiError(error); }
}
