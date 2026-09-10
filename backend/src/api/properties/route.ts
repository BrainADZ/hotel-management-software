import { requireApplicationContext } from '@/services/auth/actor';
import { apiError, apiJson } from '@/services/api-response';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { properties, property } = await requireApplicationContext(request);
    return apiJson({ properties, property });
  } catch (error) { return apiError(error); }
}
