import { apiError, apiJson } from '@/services/api-response';
import { requireTravelContext } from '@/services/travel/context';
import { TravelService } from '@/services/travel/service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { return apiJson(await new TravelService().snapshot(await requireTravelContext(request))); } catch (error) { return apiError(error); } }
