import { appMode, assertDemoMode } from '@/services/app-mode';
import { requireAppActor } from '@/services/auth/actor';
import { DomainError, resolveBusinessUnit } from '@hotel/shared/domain';
import { actorFromRequest, getDemoState, runCommand } from '@/services/demo-store';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof DomainError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  console.error('BrainADZ Hospitality OS demo API failure', error);
  return json({ error: { code: 'INTERNAL_ERROR', message: 'The operation could not be completed.' } }, 500);
}

export async function GET(request: Request) {
  try {
    if (appMode() === 'production') { await requireAppActor(request); assertDemoMode(); }
    const actor = actorFromRequest(request);
    const businessUnit = resolveBusinessUnit(actor.role, request.headers.get('x-business-unit'));
    return json(await getDemoState(actor, businessUnit));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    if (appMode() === 'production') { await requireAppActor(request); assertDemoMode(); }
    const actor = actorFromRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await runCommand(actor, body);
    return json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
