import { apiError, apiJson } from '@/services/api-response';
import { requireTravelContext } from '@/services/travel/context';
import { TravelService } from '@/services/travel/service';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { return apiJson(await new TravelService().resolveDiscount(await requireTravelContext(request), (await params).id, await request.json())); } catch (error) { return apiError(error); } }
