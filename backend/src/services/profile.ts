import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { DomainError } from '@hotel/shared/domain';
import { appUsers } from '@/db/schema';
import { getDb } from '@/db';
import { requireApplicationContext } from './auth/actor';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const avatarRoot = () => path.resolve(process.env.AVATAR_STORAGE_DIR ?? path.join(process.cwd(), 'data', 'avatars'));
const types = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
export function detectImage(buffer: Buffer): keyof typeof types | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return 'webp';
  return null;
}
export function avatarFor(user: { customAvatarKey: string | null; googleAvatarUrl: string | null }) { return user.customAvatarKey ? '/api/profile/avatar/file' : user.googleAvatarUrl; }
async function ownUser(request: Request) {
  const context = await requireApplicationContext(request);
  const user = (await getDb().select().from(appUsers).where(eq(appUsers.id, context.user.id)).limit(1))[0];
  if (!user) throw new DomainError('USER_NOT_FOUND', 'Profile could not be found.', 404);
  return { context, user };
}
export async function getProfile(request: Request) {
  const { context, user } = await ownUser(request);
  return { id: user.id, displayName: user.displayName ?? user.name, email: user.email, role: user.role, provider: context.user.provider, avatar: avatarFor(user), property: context.property, properties: context.properties };
}
export async function updateProfile(request: Request, displayNameValue: unknown) {
  const { user } = await ownUser(request), displayName = String(displayNameValue ?? '').trim();
  if (displayName.length < 2 || displayName.length > 100) throw new DomainError('INVALID_PROFILE', 'Display name must contain 2 to 100 characters.', 400);
  await getDb().update(appUsers).set({ displayName, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  return getProfile(request);
}
export async function uploadAvatar(request: Request) {
  const { user } = await ownUser(request), declared = (request.headers.get('content-type') ?? '').split(';')[0]!.toLowerCase();
  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) throw new DomainError('INVALID_AVATAR_SIZE', 'Profile photo must be no larger than 5 MB.', 400);
  const kind = detectImage(buffer);
  if (!kind || types[kind] !== declared) throw new DomainError('INVALID_AVATAR_TYPE', 'Profile photo must be a valid JPEG, PNG, or WebP image.', 400);
  const root = avatarRoot(), key = `${user.id}-${randomBytes(16).toString('hex')}.${kind === 'jpeg' ? 'jpg' : kind}`;
  await mkdir(root, { recursive: true }); await writeFile(path.join(root, key), buffer, { flag: 'wx' });
  const oldKey = user.customAvatarKey;
  await getDb().update(appUsers).set({ customAvatarKey: key, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  if (oldKey) await unlink(path.join(root, path.basename(oldKey))).catch(() => undefined);
  return { avatar: '/api/profile/avatar/file' };
}
export async function removeAvatar(request: Request) {
  const { user } = await ownUser(request), key = user.customAvatarKey;
  await getDb().update(appUsers).set({ customAvatarKey: null, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, user.id));
  if (key) await unlink(path.join(avatarRoot(), path.basename(key))).catch(() => undefined);
  return { avatar: user.googleAvatarUrl };
}
export async function readAvatar(request: Request) {
  const { user } = await ownUser(request), key = user.customAvatarKey;
  if (!key || key !== path.basename(key)) throw new DomainError('AVATAR_NOT_FOUND', 'Profile photo was not found.', 404);
  const extension = path.extname(key).slice(1), mime = extension === 'jpg' ? types.jpeg : types[extension as 'png' | 'webp'];
  if (!mime) throw new DomainError('AVATAR_NOT_FOUND', 'Profile photo was not found.', 404);
  try { return { bytes: await readFile(path.join(avatarRoot(), key)), mime }; } catch { throw new DomainError('AVATAR_NOT_FOUND', 'Profile photo was not found.', 404); }
}
