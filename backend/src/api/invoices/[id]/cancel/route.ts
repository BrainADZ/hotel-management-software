import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { BillingService } from '@/modules/billing/service';
import { entityIdSchema } from '@/services/reservations/validation';

export async function POST(
  request: Request,
  route: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const context = await requireReservationContext(request);

    const invoiceId = entityIdSchema.parse(
      (await route.params).id,
    );

    const body = await request.json();

    return apiJson(
      await new BillingService().cancelInvoice(
        context,
        invoiceId,
        body,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
