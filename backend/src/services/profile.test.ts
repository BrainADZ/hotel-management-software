import { describe, expect, it } from 'vitest';
import { avatarFor, detectImage } from './profile';
describe('profile avatars', () => {
  it('validates supported image signatures', () => { expect(detectImage(Buffer.from([0xff,0xd8,0xff,0x00]))).toBe('jpeg'); expect(detectImage(Buffer.from([137,80,78,71,13,10,26,10]))).toBe('png'); expect(detectImage(Buffer.from('not an image'))).toBeNull(); });
  it('prefers a custom avatar over Google and otherwise falls back', () => { expect(avatarFor({customAvatarKey:'safe.jpg',googleAvatarUrl:'https://google/avatar'})).toBe('/api/profile/avatar/file'); expect(avatarFor({customAvatarKey:null,googleAvatarUrl:'https://google/avatar'})).toBe('https://google/avatar'); expect(avatarFor({customAvatarKey:null,googleAvatarUrl:null})).toBeNull(); });
});
