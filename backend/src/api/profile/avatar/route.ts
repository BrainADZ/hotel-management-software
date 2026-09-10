import { apiError, apiJson } from '@/services/api-response';
import { removeAvatar, uploadAvatar } from '@/services/profile';
export async function POST(request: Request) { try { return apiJson(await uploadAvatar(request)); } catch (error) { return apiError(error); } }
export async function DELETE(request: Request) { try { return apiJson(await removeAvatar(request)); } catch (error) { return apiError(error); } }
