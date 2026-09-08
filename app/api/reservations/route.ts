import { apiError, apiJson } from '@/lib/server/api-response';
import { requireReservationContext } from '@/lib/server/reservations/http';
import { productionReservationRepository } from '@/lib/server/reservations/repository';
import { ReservationService } from '@/lib/server/reservations/service';
import { reservationCreateSchema, reservationListSchema } from '@/lib/server/reservations/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const context = await requireReservationContext(request); const query = reservationListSchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return apiJson(await new ReservationService(productionReservationRepository()).list(context, query)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { const context = await requireReservationContext(request); const input = reservationCreateSchema.parse(await request.json()); return apiJson(await new ReservationService(productionReservationRepository()).create(context, input), 201); }
  catch (error) { return apiError(error); }
}
