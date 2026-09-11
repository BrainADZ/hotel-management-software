import {saveTravelCatalog} from '@/services/travel/catalog';
import {apiJson,apiError} from '@/services/api-response';
import {requireTravelContext} from '@/services/travel/context';
import {mutateTravelWorkflow} from '@/services/travel/workflows';
export async function POST(request:Request){try{const c=await requireTravelContext(request),body=await request.json();return apiJson(await (['CREATE_TRAVEL_PRODUCT','SAVE_TRAVEL_ASSET'].includes(body.action)?saveTravelCatalog(c,body):mutateTravelWorkflow(c,body)));}catch(error){return apiError(error);}}
