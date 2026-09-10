import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginGoogleLogin, googleConfigured } from './google';
afterEach(() => vi.unstubAllEnvs());
describe('Google OpenID Connect', () => {
  it('stays disabled without complete server credentials', () => { vi.stubEnv('GOOGLE_CLIENT_ID',''); expect(googleConfigured()).toBe(false); expect(() => beginGoogleLogin()).toThrow(/not configured/i); });
  it('creates state, nonce and PKCE and keeps the flow in an HttpOnly cookie', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID','client-id'); vi.stubEnv('GOOGLE_CLIENT_SECRET','server-secret'); vi.stubEnv('GOOGLE_REDIRECT_URI','http://localhost:4000/api/auth/google/callback'); vi.stubEnv('LOCAL_AUTH_COOKIE_SECURE','false');
    const result=beginGoogleLogin(), url=new URL(result.location);
    expect(url.searchParams.get('scope')).toBe('openid email profile'); expect(url.searchParams.get('state')).toBeTruthy(); expect(url.searchParams.get('nonce')).toBeTruthy(); expect(url.searchParams.get('code_challenge_method')).toBe('S256'); expect(result.cookie).toContain('HttpOnly; SameSite=Lax'); expect(result.cookie).not.toContain('server-secret');
  });
});
