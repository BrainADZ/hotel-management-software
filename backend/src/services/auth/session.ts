import { createHash, timingSafeEqual } from 'node:crypto';
import type { HostingIdentity } from './types';

/** Only a trusted authentication gateway may inject these headers. Never accept
 * raw browser identity headers, even when the hosting provider uses these names. */
export async function resolveHostingIdentity(headers: Headers): Promise<HostingIdentity | null> {
  const secret = process.env.AUTH_TRUSTED_PROXY_SECRET;
  if (process.env.AUTH_PROVIDER !== 'trusted-hosting' || !secret || secret.length < 32) return null;
  const proof = headers.get('x-app-auth-proxy-secret');
  if (!proof || proof.length > 1024) return null;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(secret), digest(proof))) return null;
  const subject = headers.get('oai-authenticated-user-id');
  const email = headers.get('oai-authenticated-user-email');
  if (!subject || !email || subject.length > 512 || email.length > 320) return null;
  let fullName: string | null = null;
  if (headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { fullName = decodeURIComponent(headers.get('oai-authenticated-user-full-name') ?? '') || null; } catch { /* Optional display metadata. */ }
  }
  return { provider: 'trusted-hosting', subject, email, fullName };
}
