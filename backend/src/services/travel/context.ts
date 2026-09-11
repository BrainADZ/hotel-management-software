import { assertRoleCan, type AppRole } from '@hotel/shared/domain';
import { requireApplicationContext } from '@/services/auth/actor';

export type TravelContext = {
  actor: { id: string; name: string; email: string; role: AppRole; organisationId: string };
  organisation: { id: string; name: string };
};

export async function requireTravelContext(request: Request): Promise<TravelContext> {
  const context = await requireApplicationContext(request);
  assertRoleCan(context.user.role, 'travel.read');
  return {
    actor: { ...context.user, organisationId: context.organisation.id },
    organisation: context.organisation,
  };
}
