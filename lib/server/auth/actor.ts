import { DomainError, businessUnitsForRole, isAppRole } from '@/lib/domain';
import { appMode } from '../app-mode';
import { resolveHostingIdentity } from './session';
import { permittedProperties, requirePropertyAccess } from './property-access';
import type { AppActor, ApplicationContext, ContextRepository, HostingIdentity } from './types';

export async function resolveProductionContext(request: Request, identity: HostingIdentity, repository: ContextRepository): Promise<ApplicationContext> {
  const user = await repository.findUser(identity);
  if (!user || !user.active || !isAppRole(user.role)) throw new DomainError('USER_FORBIDDEN', 'An active application account is required.', 403);
  const organisation = await repository.findOrganisation(user.organisationId);
  if (!organisation?.active) throw new DomainError('ORGANISATION_FORBIDDEN', 'Organisation access is unavailable.', 403);
  const actor: AppActor = { id: user.id, name: user.name, email: user.email, role: user.role,
    organisationId: user.organisationId, propertyId: user.propertyId };
  const businessUnits = businessUnitsForRole(actor.role);
  const candidates = businessUnits.includes('HOTEL') && (actor.role === 'OWNER' || actor.propertyId)
    ? await repository.listProperties(actor.organisationId, actor.role === 'OWNER' ? undefined : actor.propertyId ?? undefined) : [];
  const properties = permittedProperties(actor, candidates);
  const requestedProperty = new URL(request.url).searchParams.get('propertyId');
  const property = requestedProperty !== null ? requirePropertyAccess(actor, properties, requestedProperty)
    : properties.find((entry) => entry.id === actor.propertyId) ?? (actor.role === 'OWNER' ? properties[0] ?? null : null);
  if (businessUnits.length === 1 && businessUnits[0] === 'HOTEL' && !property) {
    throw new DomainError('PROPERTY_FORBIDDEN', 'An active assigned property is required.', 403);
  }
  return { user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role },
    organisation: { id: organisation.id, name: organisation.name }, property, properties, businessUnits };
}

export async function requireApplicationContext(request: Request): Promise<ApplicationContext> {
  if (appMode() === 'demo') {
    const { demoApplicationContext } = await import('./demo');
    return demoApplicationContext(request);
  }
  const identity = await resolveHostingIdentity(request.headers);
  if (!identity) throw new DomainError('UNAUTHENTICATED', 'Authentication is required.', 401);
  const { contextRepository } = await import('./repository');
  return resolveProductionContext(request, identity, contextRepository);
}

export async function requireAppActor(request: Request): Promise<AppActor> {
  const context = await requireApplicationContext(request);
  return { ...context.user, organisationId: context.organisation.id, propertyId: context.property?.id ?? null };
}
