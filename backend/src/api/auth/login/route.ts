import { apiError } from '@/services/api-response';
import { loginLocal, sessionCookie } from '@/services/auth/local-session';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await loginLocal(body.email, body.password);
    return Response.json({ user: result.user }, { status: 200, headers: { 'Cache-Control': 'no-store, private', 'Set-Cookie': sessionCookie(result.token, result.expiresAt), 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return apiError(error); }
}
