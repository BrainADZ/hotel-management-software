import { DomainError, businessUnitsForRole } from '@hotel/shared/domain';
import type { AppActor, PropertyContext } from './types';

export function permittedProperties(actor: AppActor, candidates: readonly PropertyContext[]): PropertyContext[] {
  if (!businessUnitsForRole(actor.role).includes('HOTEL')) return [];
  return candidates.filter((property) => property.organisationId === actor.organisationId &&
    (actor.role === 'OWNER' || property.id === actor.propertyId));
}
/** A requested property is a selector, never an authorization claim. */
export function requirePropertyAccess(actor: AppActor, candidates: readonly PropertyContext[], propertyId: string): PropertyContext {
  const property = permittedProperties(actor, candidates).find((entry) => entry.id === propertyId);
  if (!property) throw new DomainError('PROPERTY_FORBIDDEN', 'Access to this property is not permitted.', 403);
  return property;
}
