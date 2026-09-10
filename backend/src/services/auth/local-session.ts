import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt } from 'drizzle-orm';
import { appUsers, userSessions } from '@/db/schema';
import { getDb } from '@/db';
import { DomainError } from '@hotel/shared/domain';
import type { HostingIdentity } from './types';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'hotel_session';
const SESSION_AGE_SECONDS = 60 * 60 * 12;

export function localAuthEnabled() { return process.env.APP_MODE === 'production' && process.env.LOCAL_AUTH_ENABLED === 'true'; }
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password: string) {
  if (password.length < 8 || password.length > 200) throw new DomainError('INVALID_PASSWORD', 'Password must contain at least 8 characters.', 400);
  const salt = randomBytes(16), derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, encoded: string | null) {
  if (!encoded || password.length > 200) return false;
  const [algorithm, saltText, expectedText] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltText || !expectedText) return false;
  try {
    const expected = Buffer.from(expectedText, 'base64');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

function cookieValue(headers: Headers) {
  const cookie = headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return null;
}

export async function resolveLocalSession(headers: Headers): Promise<HostingIdentity | null> {
  if (!localAuthEnabled()) return null;
  const token = cookieValue(headers);
  if (!token || token.length > 256) return null;
  const timestamp = new Date().toISOString(), db = getDb();
  const row = (await db.select({ sessionId: userSessions.id, userId: appUsers.id, email: appUsers.email, name: appUsers.name, provider: appUsers.authProvider, subject: appUsers.authSubject })
    .from(userSessions).innerJoin(appUsers, eq(appUsers.id, userSessions.userId))
    .where(and(eq(userSessions.tokenHash, tokenHash(token)), gt(userSessions.expiresAt, timestamp), eq(appUsers.active, true))).limit(1))[0];
  if (!row) return null;
  await db.update(userSessions).set({ lastUsedAt: timestamp }).where(eq(userSessions.id, row.sessionId));
  return { provider: (row.provider ?? 'local-session') as HostingIdentity['provider'], subject: row.subject ?? row.email.toLowerCase(), email: row.email, fullName: row.name };
}

export async function createSessionForUser(userId: string) {
  const token = randomBytes(32).toString('base64url'), createdAt = new Date(), expiresAt = new Date(createdAt.getTime() + SESSION_AGE_SECONDS * 1000);
  await getDb().insert(userSessions).values({ id: crypto.randomUUID(), userId, tokenHash: tokenHash(token), createdAt: createdAt.toISOString(), lastUsedAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() });
  return { token, expiresAt };
}

export async function loginLocal(emailValue: unknown, passwordValue: unknown) {
  if (!localAuthEnabled()) throw new DomainError('LOCAL_AUTH_DISABLED', 'Local production authentication is disabled.', 403);
  const email = String(emailValue ?? '').trim().toLowerCase(), password = String(passwordValue ?? '');
  if (!email || !password) throw new DomainError('INVALID_CREDENTIALS', 'Email and password are required.', 400);
  const db = getDb();
  const user = (await db.select().from(appUsers).where(and(eq(appUsers.authProvider, 'local-session'), eq(appUsers.authSubject, email), eq(appUsers.active, true))).limit(1))[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new DomainError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
  const session = await createSessionForUser(user.id);
  return { ...session, user: { id: user.id, name: user.displayName ?? user.name, email: user.email, role: user.role } };
}

export async function logoutLocal(headers: Headers) {
  const token = cookieValue(headers);
  if (token) await getDb().delete(userSessions).where(eq(userSessions.tokenHash, tokenHash(token)));
}

export function sessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.LOCAL_AUTH_COOKIE_SECURE !== 'false';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE_SECONDS}; Expires=${expiresAt.toUTCString()}${secure ? '; Secure' : ''}`;
}
export function expiredSessionCookie() {
  const secure = process.env.LOCAL_AUTH_COOKIE_SECURE !== 'false';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`;
}
