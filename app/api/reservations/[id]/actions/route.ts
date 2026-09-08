import { apiError, apiJson } from '@/lib/server/api-response';
import { requireReservationContext } from '@/lib/server/reservations/http';
import { productionReservationRepository } from '@/lib/server/reservations/repository';
import { ReservationService } from '@/lib/server/reservations/service';
import { entityIdSchema, reservationActionSchema } from '@/lib/server/reservations/validation';
import { DomainError } from '@/lib/domain';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const context = await requireReservationContext(request); const id = entityIdSchema.parse((await route.params).id); const action = reservationActionSchema.parse(await request.json()); if(action.type==='CHECK_IN') throw new DomainError('CHECKIN_ENDPOINT_REQUIRED','Use the front-desk check-in operation.',409); return apiJson(await new ReservationService(productionReservationRepository()).action(context, id, action)); }
  catch (error) { return apiError(error); }
}
