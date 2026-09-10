import { requireApplicationContext } from '@/services/auth/actor';
import { apiError, apiJson } from '@/services/api-response';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return apiJson(await requireApplicationContext(request)); } catch (error) { return apiError(error); }
}
