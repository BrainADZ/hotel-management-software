import { appMode, assertDemoMode, demoFeatureEnabled } from '@/lib/server/app-mode';
import { requireAppActor } from '@/lib/server/auth/actor';
import { z } from 'zod';
import { DomainError } from '@/lib/domain';
import { ingestExternalBooking } from '@/lib/server/demo-store';

export const dynamic = 'force-dynamic';

const inboundBooking = z.object({
  providerReference: z.string().trim().min(3).max(100),
  source: z.enum(['OTA', 'WEBSITE']),
  guestName: z.string().trim().min(2).max(120),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(32).optional(),
  city: z.string().max(80).optional(),
  dietaryRequirements: z.string().max(240).optional(),
  guestCount: z.number().int().min(1).max(12).optional(),
  mealPlan: z.array(z.enum(['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SUPPER'])).max(6).optional(),
  arrivalDate: z.iso.date(),
  departureDate: z.iso.date(),
  roomType: z.enum(['Standard', 'Deluxe', 'Premium', 'Suite']),
});

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
}

export async function POST(request: Request) {
  try {
    if (appMode() === 'production') { await requireAppActor(request); assertDemoMode(); }
    const configuredSecret = process.env.INBOUND_BOOKING_SECRET;
    const bearer = request.headers.get('authorization');
    const sandboxProvider = request.headers.get('x-demo-provider');
    const authenticated = configuredSecret
      ? bearer === `Bearer ${configuredSecret}`
      : demoFeatureEnabled('DEMO_INBOUND_BOOKINGS') && sandboxProvider === 'channel-manager-sandbox';
    if (!authenticated) return response({ error: { code: 'UNAUTHORISED_PROVIDER', message: 'Valid booking-provider credentials are required.' } }, 401);
    const parsed = inboundBooking.safeParse(await request.json());
    if (!parsed.success) return response({ error: { code: 'INVALID_BOOKING', message: parsed.error.issues[0]?.message ?? 'Invalid booking payload.' } }, 400);
    const result = await ingestExternalBooking(parsed.data);
    return response({ ok: true, result }, 'idempotent' in result && result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof DomainError) return response({ error: { code: error.code, message: error.message } }, error.status);
    console.error('Inbound booking failure', error);
    return response({ error: { code: 'INTERNAL_ERROR', message: 'The booking could not be accepted.' } }, 500);
  }
}
