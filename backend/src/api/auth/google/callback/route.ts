import { completeGoogleLogin, googleErrorRedirect } from '@/services/auth/google';
import { sessionCookie } from '@/services/auth/local-session';

export async function GET(request: Request) {
  try {
    const result = await completeGoogleLogin(request);
    const headers = new Headers({ Location: result.redirect, 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', sessionCookie(result.token, result.expiresAt));
    headers.append('Set-Cookie', result.clearFlowCookie);
    return new Response(null, { status: 302, headers });
  } catch (error) { return new Response(null, { status: 302, headers: { Location: googleErrorRedirect(error), 'Cache-Control': 'no-store' } }); }
}
