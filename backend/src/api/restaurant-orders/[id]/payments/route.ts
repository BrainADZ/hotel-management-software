import { BillingService } from '@/modules/billing/service';
import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { entityIdSchema } from '@/services/reservations/validation';

export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireReservationContext(request);
    const id = entityIdSchema.parse((await route.params).id);
    return apiJson(await new BillingService().restaurantPaymentHistory(context, id));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireReservationContext(request);
    const id = entityIdSchema.parse((await route.params).id);
    return apiJson(await new BillingService().settleRestaurantOrder(context, id, await request.json()), 201);
  } catch (error) {
    return apiError(error);
  }
}
