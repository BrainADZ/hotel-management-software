import { apiError, apiJson } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { guestService } from '@/services/guests/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const c=await requireReservationContext(request);const u=new URL(request.url);return apiJson(await guestService.list(c,Object.fromEntries(u.searchParams)));}catch(e){return apiError(e);}}
export async function POST(request:Request){try{const c=await requireReservationContext(request);return apiJson(await guestService.create(c,await request.json()),201);}catch(e){return apiError(e);}}
