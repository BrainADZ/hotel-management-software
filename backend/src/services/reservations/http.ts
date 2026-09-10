import { DomainError } from '@hotel/shared/domain';
import { appMode } from '@/services/app-mode';
import { requireApplicationContext } from '@/services/auth/actor';
import type { ReservationContext } from './types';

export async function requireReservationContext(request: Request): Promise<ReservationContext> {
  if (appMode() !== 'production') throw new DomainError('PRODUCTION_API_DISABLED', 'Production reservation APIs are disabled in demo mode.', 403);
  const context = await requireApplicationContext(request);
  if (!context.property) throw new DomainError('PROPERTY_ACCESS_DENIED', 'Select an active hotel property.', 403);
  return { actor: { ...context.user, organisationId: context.organisation.id, propertyId: context.property.id }, property: context.property };
}
