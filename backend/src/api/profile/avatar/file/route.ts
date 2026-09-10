import { apiError } from '@/services/api-response';
import { readAvatar } from '@/services/profile';
export async function GET(request: Request) { try { const avatar = await readAvatar(request); return new Response(new Uint8Array(avatar.bytes), { headers: { 'Content-Type': avatar.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } }); } catch (error) { return apiError(error); } }
