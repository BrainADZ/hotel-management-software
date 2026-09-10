import { apiError, apiJson } from '@/services/api-response';
import { getProfile, updateProfile } from '@/services/profile';
export async function GET(request: Request) { try { return apiJson(await getProfile(request)); } catch (error) { return apiError(error); } }
export async function PATCH(request: Request) { try { const body = await request.json() as Record<string, unknown>; return apiJson(await updateProfile(request, body.displayName)); } catch (error) { return apiError(error); } }
