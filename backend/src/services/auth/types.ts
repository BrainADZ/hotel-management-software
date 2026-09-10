import type { AppRole, BusinessUnit } from '@hotel/shared/domain';

export type AuthenticatedUser = { id: string; name: string; email: string; role: AppRole; avatar?: string | null; provider?: string | null };
export type AppActor = AuthenticatedUser & { organisationId: string; propertyId: string | null };
export type OrganisationContext = { id: string; name: string };
export type PropertyContext = { id: string; organisationId: string; name: string; code: string; timezone: string };
export type ApplicationContext = {
  user: AuthenticatedUser;
  organisation: OrganisationContext;
  property: PropertyContext | null;
  properties: PropertyContext[];
  businessUnits: readonly BusinessUnit[];
};
export type HostingIdentity = { provider: 'trusted-hosting' | 'local-session' | 'google'; subject: string; email: string; fullName: string | null };
export type StoredUser = Omit<AppActor, 'role'> & { role: string; active: boolean; displayName?: string | null; googleAvatarUrl?: string | null; customAvatarKey?: string | null; authProvider?: string | null };
export type StoredOrganisation = OrganisationContext & { active: boolean };
export type ContextRepository = {
  findUser(identity: HostingIdentity): Promise<StoredUser | null>;
  findOrganisation(organisationId: string): Promise<StoredOrganisation | null>;
  listProperties(organisationId: string, assignedPropertyId?: string): Promise<PropertyContext[]>;
};
