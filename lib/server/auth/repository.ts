import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, organisations, properties } from '@/db/schema';
import type { ContextRepository } from './types';

export const contextRepository: ContextRepository = {
  async findUser(identity) {
    // This unique provider/subject lookup establishes the tenant. Never match
    // by browser email, browser tenant ID, or automatically provision an owner.
    const [user] = await getDb().select({ id: appUsers.id, organisationId: appUsers.organisationId,
      propertyId: appUsers.propertyId, name: appUsers.name, email: appUsers.email,
      role: appUsers.role, active: appUsers.active }).from(appUsers)
      .where(and(eq(appUsers.authProvider, identity.provider), eq(appUsers.authSubject, identity.subject))).limit(1);
    return user ?? null;
  },
  async findOrganisation(organisationId) {
    const [organisation] = await getDb().select({ id: organisations.id, name: organisations.name, active: organisations.active })
      .from(organisations).where(eq(organisations.id, organisationId)).limit(1);
    return organisation ?? null;
  },
  async listProperties(organisationId, assignedPropertyId) {
    return getDb().select({ id: properties.id, organisationId: properties.organisationId, name: properties.name,
      code: properties.code, timezone: properties.timezone }).from(properties)
      .where(and(eq(properties.organisationId, organisationId), eq(properties.active, true),
        assignedPropertyId === undefined ? undefined : eq(properties.id, assignedPropertyId))).orderBy(properties.code);
  },
};
