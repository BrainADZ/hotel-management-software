import { BillingService } from '@/modules/billing/service';
import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireReservationContext(request);
    const { id } = await route.params;
    return apiJson(await new BillingService().settleRestaurantOrder(context, id, await request.json()), 201);
  } catch (error) {
    return apiError(error);
  }
}
