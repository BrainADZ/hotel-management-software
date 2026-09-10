import { apiError } from '@/services/api-response';
import { expiredSessionCookie, logoutLocal } from '@/services/auth/local-session';

export async function POST(request: Request) {
  try {
    await logoutLocal(request.headers);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, private', 'Set-Cookie': expiredSessionCookie(), 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return apiError(error); }
}
