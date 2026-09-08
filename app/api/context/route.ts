import { requireApplicationContext } from '@/lib/server/auth/actor';
import { apiError, apiJson } from '@/lib/server/api-response';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return apiJson(await requireApplicationContext(request)); } catch (error) { return apiError(error); }
}
