import { apiError, apiJson } from '@/services/api-response';
import { OfflineSyncService } from '@/services/offline-sync/service';
export async function POST(request: Request) { try { return apiJson(await new OfflineSyncService().sync(request, await request.json())); } catch (error) { return apiError(error); } }
