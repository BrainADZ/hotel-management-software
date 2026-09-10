import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from './app';
afterEach(() => vi.unstubAllEnvs());
it('preserves production authentication errors through HTTP and rejects browser identity', async () => {
  vi.stubEnv('APP_MODE', 'production'); vi.stubEnv('AUTH_PROVIDER', 'disabled');
  const app = await createApp();
  try {
    for (const url of ['/api/context', '/api/auth/me', '/api/reservations', '/api/guests', '/api/front-desk', '/api/rooms', '/api/folios', '/api/folios/00000000-0000-4000-8000-000000000001']) {
      const response = await app.inject({ url, headers: { 'x-demo-role': 'OWNER', 'oai-authenticated-user-id': 'forged' } });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
      expect(response.headers['cache-control']).toBe('no-store, private');
    }
  } finally { await app.close(); }
});
it('allows configured credentialed CORS and blocks other origins', async () => {
  const app = await createApp();
  try {
    const allowed = await app.inject({ method: 'OPTIONS', url: '/api/reservations', headers: {
      origin: 'http://localhost:3000', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
    } });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const blocked = await app.inject({ url: '/api/runtime', headers: { origin: 'https://untrusted.example' } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  } finally { await app.close(); }
});
it('serves backend mode and dispatches dynamic action routes', async () => {
  vi.stubEnv('APP_MODE', 'production'); vi.stubEnv('AUTH_PROVIDER', 'disabled');
  const app = await createApp();
  try {
    expect((await app.inject('/api/runtime')).json()).toEqual({ mode: 'production', showDemoCredentials: false, googleConfigured: false });
    for (const url of ['/api/reservations/test/check-in', '/api/stays/test/room-move', '/api/guests/test/identity-documents', '/api/reservations/test/financial-checkout', '/api/folios/test/payments', '/api/payments/test/refund']) {
      const response = await app.inject({ method: 'POST', url, payload: { version: 1 } });
      expect(response.statusCode).toBe(401);
    }
  } finally { await app.close(); }
});
it('exposes demo credential visibility only through the explicit flag', async () => {
  vi.stubEnv('SHOW_DEMO_CREDENTIALS', 'true');
  const app = await createApp();
  try { expect((await app.inject('/api/runtime')).json().showDemoCredentials).toBe(true); }
  finally { await app.close(); }
});
