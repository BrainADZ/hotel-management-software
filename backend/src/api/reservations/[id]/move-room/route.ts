import { and, eq } from 'drizzle-orm';

import { stays } from '@/db/schema';
import { getDb } from '@/db';

import {
  apiError,
  apiJson,
} from '@/services/api-response';

import {
  requireReservationContext,
} from '@/services/reservations/http';

import {
  entityIdSchema,
} from '@/services/reservations/validation';

import {
  FrontDeskService,
} from '@/services/front-desk/service';

import {
  DomainError,
} from '@hotel/shared/domain';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  route: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const context =
      await requireReservationContext(
        request,
      );

    const reservationId =
      entityIdSchema.parse(
        (await route.params).id,
      );

    /*
     * Room Move works on an active stay,
     * while the frontend knows the reservation ID.
     *
     * Resolve the active IN_HOUSE stay here.
     */
    const activeStay = (
      await getDb()
        .select({
          id: stays.id,
        })
        .from(stays)
        .where(
          and(
            eq(
              stays.reservationId,
              reservationId,
            ),
            eq(
              stays.organisationId,
              context.actor.organisationId,
            ),
            eq(
              stays.propertyId,
              context.property.id,
            ),
            eq(
              stays.status,
              'IN_HOUSE',
            ),
          ),
        )
        .limit(1)
    )[0];

    if (!activeStay) {
      throw new DomainError(
        'STAY_NOT_FOUND',
        'An active in-house stay was not found for this reservation.',
        404,
      );
    }

    const body = await request.json();

    const result =
      await new FrontDeskService().moveRoom(
        context,
        activeStay.id,
        body,
      );

    return apiJson(result);
  } catch (error) {
    return apiError(error);
  }
}