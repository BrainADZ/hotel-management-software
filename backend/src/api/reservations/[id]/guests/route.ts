import { z } from 'zod';
import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { entityIdSchema } from '@/services/reservations/validation';
import { listReservationGuests, linkReservationGuest } from '@/services/reservations/guest-links';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, route: Context) {
  try {
    const context = await requireReservationContext(request);
    return apiJson(await listReservationGuests(context, entityIdSchema.parse((await route.params).id)));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, route: Context) {
  try {
    const context = await requireReservationContext(request);
    return apiJson(await linkReservationGuest(context, entityIdSchema.parse((await route.params).id),
      async () => entityIdSchema.parse(z.object({ guestId: z.string() }).parse(await request.json()).guestId)), 201);
  } catch (error) { return apiError(error); }
}
