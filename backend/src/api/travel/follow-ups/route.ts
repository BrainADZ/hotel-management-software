import { apiError, apiJson } from '@/services/api-response';
import { requireTravelContext } from '@/services/travel/context';
import { TravelService } from '@/services/travel/service';
export async function POST(request: Request) { try { return apiJson(await new TravelService().createFollowUp(await requireTravelContext(request), await request.json()), 201); } catch (error) { return apiError(error); } }
