import { DomainError } from '@/lib/domain';
import { ZodError } from 'zod';
export function apiJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
}
export function apiError(error: unknown): Response {
  if (error instanceof DomainError) return apiJson({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof ZodError) return apiJson({ error: { code: 'INVALID_REQUEST', message: error.issues[0]?.message ?? 'Invalid request.' } }, 400);
  console.error('Application context API failure', error instanceof Error ? error.name : 'Unknown error');
  return apiJson({ error: { code: 'INTERNAL_ERROR', message: 'The operation could not be completed.' } }, 500);
}
