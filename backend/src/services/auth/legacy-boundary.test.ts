import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET, POST } from '@/api/demo/route';
import { POST as inboundPOST } from '@/api/bookings/inbound/route';
import { ensureDemoDatabase } from '../demo-store';

// No database may be touched by production calls to legacy/demo operations.
const database = vi.hoisted(() => ({ prepare: vi.fn(), batch: vi.fn() }));
vi.mock('@/demo/storage', () => ({ env: { DB: database } }));
vi.mock('./repository', () => ({ contextRepository: {
  findUser: async () => ({ id: 'u', organisationId: 'org', propertyId: null, name: 'Owner', email: 'owner@example.test', role: 'OWNER', active: true }),
  findOrganisation: async () => ({ id: 'org', name: 'Org', active: true }),
  listProperties: async () => [],
} }));
const secret = 'test-only-gateway-secret-at-least-32-characters';
beforeEach(() => {
  vi.stubEnv('APP_MODE', 'production');
  vi.stubEnv('AUTH_PROVIDER', 'trusted-hosting');
  vi.stubEnv('AUTH_TRUSTED_PROXY_SECRET', secret);
  vi.stubEnv('DEMO_ROLE_SWITCHER', 'true');
  vi.stubEnv('DEMO_NETWORK_SIMULATOR', 'true');
  vi.stubEnv('DEMO_INBOUND_BOOKINGS', 'true');
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
it.each([GET, POST, inboundPOST])('requires authentication at the legacy API boundary', async (handler) => {
  const response = await handler(new Request('https://hotel.example/api/demo', { headers: { 'x-demo-role': 'OWNER', 'x-demo-provider': 'channel-manager-sandbox' } }));
  expect(response.status).toBe(401);
  expect(database.prepare).not.toHaveBeenCalled();
  expect(database.batch).not.toHaveBeenCalled();
});
it.each([GET, POST, inboundPOST])('blocks legacy operations even for authenticated production owners', async (handler) => {
  const response = await handler(new Request('https://hotel.example/api/demo', { headers: {
    'oai-authenticated-user-id': 'subject', 'oai-authenticated-user-email': 'owner@example.test', 'x-app-auth-proxy-secret': secret,
  } }));
  expect(response.status).toBe(403);
  expect(database.prepare).not.toHaveBeenCalled();
  expect(database.batch).not.toHaveBeenCalled();
});
it('blocks the seed helper independently of the HTTP routes', async () => {
  await expect(ensureDemoDatabase()).rejects.toMatchObject({ status: 403 });
  expect(database.prepare).not.toHaveBeenCalled();
});
