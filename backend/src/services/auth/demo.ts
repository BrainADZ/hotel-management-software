import { DEMO_ORGANISATION_ID, DEMO_PROPERTY_ID, businessUnitsForRole, isAppRole, type AppRole } from '@hotel/shared/domain';
import { assertDemoMode, demoFeatureEnabled } from '../app-mode';
import { permittedProperties, requirePropertyAccess } from './property-access';
import type { AppActor, ApplicationContext, PropertyContext } from './types';

/** UAT identity only. Never called in production and never uses hosting headers. */
export function demoActorFromRequest(request: Request): AppActor {
  assertDemoMode();
  const requested = request.headers.get('x-demo-role')?.toUpperCase();
  const role = demoFeatureEnabled('DEMO_ROLE_SWITCHER') && isAppRole(requested) ? requested : 'MANAGER';
  const names: Record<AppRole, string> = {
    OWNER: 'Parth Babulkar', MANAGER: 'Arjun Khanna', RECEPTION: 'Priya Deshmukh', TRAVEL_AGENT: 'Neha Kulkarni',
    TOUR_MANAGER: 'Rohan Verma', ACCOUNTS: 'Aditi Mehta', HOUSEKEEPING: 'Sonal Pawar', RESTAURANT: 'Kabir Shaikh', REPORTING: 'Maya Iyer',
  };
  return { id: `demo-${role.toLowerCase()}`, name: names[role], email: `${role.toLowerCase()}@demo.hospitalityos.brainadz.com`,
    role, organisationId: DEMO_ORGANISATION_ID, propertyId: DEMO_PROPERTY_ID };
}
export function demoApplicationContext(request: Request): ApplicationContext {
  const actor = demoActorFromRequest(request);
  const demoProperty: PropertyContext = { id: DEMO_PROPERTY_ID, organisationId: DEMO_ORGANISATION_ID,
    name: 'Meridian Grand Hotel', code: 'MGH', timezone: 'Asia/Kolkata' };
  const properties = permittedProperties(actor, [demoProperty]);
  const requested = new URL(request.url).searchParams.get('propertyId');
  const property = requested !== null ? requirePropertyAccess(actor, properties, requested) : properties[0] ?? null;
  return { user: { id: actor.id, name: actor.name, email: actor.email, role: actor.role, avatar: null, provider: 'demo' },
    organisation: { id: DEMO_ORGANISATION_ID, name: 'BrainADZ Hospitality Demo' }, property, properties,
    businessUnits: businessUnitsForRole(actor.role) };
}
