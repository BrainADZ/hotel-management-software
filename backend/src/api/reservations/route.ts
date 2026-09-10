import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { productionReservationRepository } from '@/services/reservations/repository';
import { ReservationService } from '@/services/reservations/service';
import { reservationCreateSchema, reservationListSchema } from '@/services/reservations/validation';
import { BillingService } from '@/modules/billing/service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const context = await requireReservationContext(request); const query = reservationListSchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return apiJson(await new ReservationService(productionReservationRepository()).list(context, query)); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { const context = await requireReservationContext(request); const input = reservationCreateSchema.parse(await request.json()); const reservation=await new ReservationService(productionReservationRepository()).create(context, input); await new BillingService().ensureFolio(context,reservation.id); return apiJson(reservation, 201); }
  catch (error) { return apiError(error); }
}
