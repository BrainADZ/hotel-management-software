import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, localAuthEnabled, sessionCookie, verifyPassword } from './local-session';

afterEach(() => vi.unstubAllEnvs());
describe('local production authentication', () => {
  it('uses salted scrypt hashes and rejects the wrong password', async () => {
    const encoded = await hashPassword('correct-horse-battery');
    expect(encoded).toMatch(/^scrypt:/);
    expect(encoded).not.toContain('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password-value', encoded)).resolves.toBe(false);
  });
  it('requires both production mode and the explicit local flag', () => {
    vi.stubEnv('APP_MODE', 'demo'); vi.stubEnv('LOCAL_AUTH_ENABLED', 'true'); expect(localAuthEnabled()).toBe(false);
    vi.stubEnv('APP_MODE', 'production'); vi.stubEnv('LOCAL_AUTH_ENABLED', 'false'); expect(localAuthEnabled()).toBe(false);
    vi.stubEnv('LOCAL_AUTH_ENABLED', 'true'); expect(localAuthEnabled()).toBe(true);
  });
  it('creates an HttpOnly secure-by-default SameSite cookie', () => {
    vi.stubEnv('LOCAL_AUTH_COOKIE_SECURE', undefined);
    expect(sessionCookie('opaque-token', new Date('2030-01-01T00:00:00Z'))).toContain('HttpOnly; SameSite=Lax');
    expect(sessionCookie('opaque-token', new Date('2030-01-01T00:00:00Z'))).toContain('; Secure');
    vi.stubEnv('LOCAL_AUTH_COOKIE_SECURE', 'false');
    expect(sessionCookie('opaque-token', new Date('2030-01-01T00:00:00Z'))).not.toContain('; Secure');
  });
});
