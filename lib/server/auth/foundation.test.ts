import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as contextGET } from '@/app/api/context/route';
import { GET as propertiesGET } from '@/app/api/properties/route';
import { GET as meGET } from '@/app/api/auth/me/route';
import { appMode, demoFeatureEnabled } from '../app-mode';
import { requireAppActor, requireApplicationContext } from './actor';
import { demoActorFromRequest } from './demo';
import { resolveHostingIdentity } from './session';
import type { ApplicationContext, ContextRepository, PropertyContext, StoredUser } from './types';

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), findOrganisation: vi.fn(), listProperties: vi.fn() }));
vi.mock('./repository', () => ({ contextRepository: mocks satisfies ContextRepository }));
const secret = 'test-only-gateway-secret-at-least-32-characters';
const property = (id: string, organisationId = 'org-a'): PropertyContext => ({ id, organisationId, name: id, code: id, timezone: 'Asia/Kolkata' });
let user: StoredUser;
function request(query = '', headers: Record<string, string> = {}) {
  return new Request(`https://hotel.example/api/context${query}`, { headers: {
    'oai-authenticated-user-id': 'external-123', 'oai-authenticated-user-email': 'verified@example.test',
    'x-app-auth-proxy-secret': secret, ...headers,
  } });
}
beforeEach(() => {
  vi.stubEnv('APP_MODE', 'production');
  vi.stubEnv('AUTH_PROVIDER', 'trusted-hosting');
  vi.stubEnv('AUTH_TRUSTED_PROXY_SECRET', secret);
  user = { id: 'user-a', name: 'Server Name', email: 'stored@example.test', role: 'MANAGER',
    organisationId: 'org-a', propertyId: 'p1', active: true };
  mocks.findUser.mockReset().mockImplementation(async () => user);
  mocks.findOrganisation.mockReset().mockResolvedValue({ id: 'org-a', name: 'Organisation A', active: true });
  // Deliberately return an over-broad list to also test defense-in-depth filtering.
  mocks.listProperties.mockReset().mockResolvedValue([property('p1'), property('p2'), property('foreign', 'org-b')]);
});
afterEach(() => vi.unstubAllEnvs());

describe('production authentication and context API', () => {
  it('returns 401 without authenticated identity before querying the database', async () => {
    const response = await contextGET(new Request('https://hotel.example/api/context'));
    expect(response.status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });
  it('rejects forged hosting headers without a valid gateway proof', async () => {
    expect((await contextGET(request('', { 'x-app-auth-proxy-secret': 'forged' }))).status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });
  it('fails closed when the adapter is disabled or secret is absent/short', async () => {
    vi.stubEnv('AUTH_PROVIDER', 'disabled');
    expect(await resolveHostingIdentity(request().headers)).toBeNull();
    vi.stubEnv('AUTH_PROVIDER', 'trusted-hosting');
    vi.stubEnv('AUTH_TRUSTED_PROXY_SECRET', 'short');
    expect(await resolveHostingIdentity(request().headers)).toBeNull();
  });
  it('rejects inactive users', async () => {
    user.active = false;
    expect((await contextGET(request())).status).toBe(403);
    expect(mocks.listProperties).not.toHaveBeenCalled();
  });
  it('rejects identities without a provisioned application user', async () => {
    mocks.findUser.mockResolvedValue(null);
    expect((await contextGET(request())).status).toBe(403);
  });
  it('rejects invalid database roles instead of defaulting to manager', async () => {
    user.role = 'SUPERUSER';
    expect((await contextGET(request())).status).toBe(403);
    user.role = 'constructor';
    expect((await contextGET(request())).status).toBe(403);
  });
  it('rejects inactive organisations', async () => {
    mocks.findOrganisation.mockResolvedValue({ id: 'org-a', name: 'Organisation A', active: false });
    expect((await contextGET(request())).status).toBe(403);
  });
  it('takes role, name, email and tenant from the database, not browser claims', async () => {
    const actor = await requireAppActor(request('?organisationId=org-b&role=OWNER', {
      'x-demo-role': 'OWNER', 'x-role': 'OWNER', 'x-organisation-id': 'org-b', 'x-property-id': 'foreign',
    }));
    expect(actor).toEqual({ id: 'user-a', name: 'Server Name', email: 'stored@example.test', role: 'MANAGER', organisationId: 'org-a', propertyId: 'p1' });
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ provider: 'trusted-hosting', subject: 'external-123' }));
    expect(mocks.findOrganisation).toHaveBeenCalledWith('org-a');
    expect(mocks.listProperties).toHaveBeenCalledWith('org-a', 'p1');
  });
  it('rejects a cross-organisation property, even for an owner', async () => {
    user.role = 'OWNER';
    expect((await contextGET(request('?propertyId=foreign'))).status).toBe(403);
  });
  it('lets owners select active permitted organisation properties', async () => {
    user.role = 'OWNER';
    const context = await requireApplicationContext(request('?propertyId=p2'));
    expect(context.property?.id).toBe('p2');
    expect(context.properties.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(mocks.listProperties).toHaveBeenCalledWith('org-a', undefined);
  });
  it('limits managers to their assigned property in the single-property model', async () => {
    expect((await requireApplicationContext(request())).properties.map((p) => p.id)).toEqual(['p1']);
    expect((await contextGET(request('?propertyId=p2'))).status).toBe(403);
  });
  it.each(['RECEPTION', 'ACCOUNTS', 'HOUSEKEEPING', 'RESTAURANT', 'REPORTING'])('limits %s to its assigned property', async (role) => {
    user.role = role;
    const context = await requireApplicationContext(request());
    expect(context.properties.map((p) => p.id)).toEqual(['p1']);
    expect(context.businessUnits).toEqual(['HOTEL']);
    expect((await contextGET(request('?propertyId=p2'))).status).toBe(403);
  });
  it('rejects missing or deactivated hotel assignments', async () => {
    user.role = 'RECEPTION';
    mocks.listProperties.mockResolvedValue([]);
    expect((await contextGET(request())).status).toBe(403);
    user.propertyId = null;
    expect((await contextGET(request())).status).toBe(403);
  });
  it.each(['TRAVEL_AGENT', 'TOUR_MANAGER'])('keeps %s at organisation-level Travel access', async (role) => {
    user.role = role;
    const context = await requireApplicationContext(request());
    expect(context.businessUnits).toEqual(['TRAVEL']);
    expect(context.properties).toEqual([]);
    expect(context.property).toBeNull();
    expect(mocks.listProperties).not.toHaveBeenCalled();
    expect((await contextGET(request('?propertyId=p1'))).status).toBe(403);
  });
  it('returns only public context fields and private no-store response headers', async () => {
    const response = await meGET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    const body = await response.json() as ApplicationContext;
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect(body.organisation).toEqual({ id: 'org-a', name: 'Organisation A' });
    const properties = await (await propertiesGET(request())).json() as Pick<ApplicationContext, 'properties' | 'property'>;
    expect(properties.properties.map((p: PropertyContext) => p.id)).toEqual(['p1']);
  });
  it('does not expose internal database errors', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.findUser.mockRejectedValue(new Error('private SQL and credentials'));
    const response = await contextGET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private SQL');
    log.mockRestore();
  });
});

describe('explicit demo isolation', () => {
  it('supports demo role switching only in demo mode', async () => {
    vi.stubEnv('APP_MODE', 'demo');
    vi.stubEnv('DEMO_ROLE_SWITCHER', 'true');
    expect(demoActorFromRequest(request('', { 'x-demo-role': 'OWNER' })).role).toBe('OWNER');
    vi.stubEnv('DEMO_ROLE_SWITCHER', 'false');
    expect(demoActorFromRequest(request('', { 'x-demo-role': 'OWNER' })).role).toBe('MANAGER');
    expect((await contextGET(new Request('https://hotel.example/api/context'))).status).toBe(200);
    expect(mocks.findUser).not.toHaveBeenCalled();
    vi.stubEnv('APP_MODE', 'production');
    expect(() => demoActorFromRequest(request())).toThrow('unavailable in production');
  });
  it('ignores all unsafe demo flags in production', () => {
    for (const flag of ['DEMO_ROLE_SWITCHER', 'DEMO_NETWORK_SIMULATOR', 'DEMO_INBOUND_BOOKINGS'] as const) {
      vi.stubEnv(flag, 'true');
      expect(demoFeatureEnabled(flag)).toBe(false);
    }
  });
  it('fails closed for missing and misspelled deployment mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_MODE', undefined);
    expect(appMode()).toBe('production');
    vi.stubEnv('APP_MODE', 'prodution');
    expect(appMode()).toBe('production');
  });
});
