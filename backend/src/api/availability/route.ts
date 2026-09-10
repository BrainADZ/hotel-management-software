import { z } from 'zod';
import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { productionReservationRepository } from '@/services/reservations/repository';
import { ReservationService } from '@/services/reservations/service';
import { entityIdSchema } from '@/services/reservations/validation';
const querySchema = z.object({ roomId: entityIdSchema, arrivalDate: z.iso.date(), departureDate: z.iso.date(), excludeReservationId: entityIdSchema.optional() });
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const context = await requireReservationContext(request); const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return apiJson(await new ReservationService(productionReservationRepository()).availability(context, input.roomId, input.arrivalDate, input.departureDate, input.excludeReservationId)); }
  catch (error) { return apiError(error); }
}
