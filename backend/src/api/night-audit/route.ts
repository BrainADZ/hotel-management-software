import {
  apiError,
  apiJson,
} from '@/services/api-response';

import {
  requireReservationContext,
} from '@/services/reservations/http';

import {
  NightAuditService,
} from '@/modules/night-audit/service';

export const dynamic =
  'force-dynamic';

export async function GET(
  request: Request,
) {
  try {
    const context =
      await requireReservationContext(
        request,
      );

    return apiJson(
      await new NightAuditService().preview(
        context,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
) {
  try {
    const context =
      await requireReservationContext(
        request,
      );

    return apiJson(
      await new NightAuditService().close(
        context,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}