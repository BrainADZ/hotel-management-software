import { apiError } from '@/services/api-response';
import { beginGoogleLogin } from '@/services/auth/google';

export async function GET() {
  try {
    const flow = beginGoogleLogin();
    return new Response(null, { status: 302, headers: { Location: flow.location, 'Set-Cookie': flow.cookie, 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
