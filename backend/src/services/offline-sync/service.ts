import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { DomainError } from '@hotel/shared/domain';
import { getDb } from '@/db';
import { auditLogs, offlineSyncMutations, rooms } from '@/db/schema';
import { requireApplicationContext } from '@/services/auth/actor';
import { requirePropertyAccess } from '@/services/auth/property-access';
import { appMode } from '@/services/app-mode';
import { productionReservationRepository } from '@/services/reservations/repository';
import { ReservationService } from '@/services/reservations/service';
import { BillingService } from '@/modules/billing/service';
import { mutateOperations } from '@/modules/operations/service';
import type { ReservationContext } from '@/services/reservations/types';
import { assertSafeOfflinePayload, offlineSyncCommand, syncBatchSchema, type OfflineSyncMutationInput } from './validation';

export type SyncItemResult = { clientMutationId: string; status: 'SYNCED' | 'CONFLICT' | 'FAILED'; serverEntityId?: string; result?: unknown; error?: { code: string; message: string }; conflict?: { code: string; message: string; serverState?: unknown } };
const canonical = (value: unknown): string => value && typeof value === 'object' ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(',')}}` : JSON.stringify(value);
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const parse = <T>(value: string | null): T | undefined => value ? JSON.parse(value) as T : undefined;

export class OfflineSyncService {
  async sync(request: Request, raw: unknown) {
    if (appMode() !== 'production') throw new DomainError('PRODUCTION_API_DISABLED', 'Production offline synchronization is unavailable in demo mode.', 403);
    const application = await requireApplicationContext(request);
    const input = syncBatchSchema.parse(raw);
    const results: SyncItemResult[] = [];
    for (const mutation of input.mutations) {
      try {
        const property = requirePropertyAccess({ ...application.user, organisationId: application.organisation.id, propertyId: application.property?.id ?? null }, application.properties, mutation.propertyId);
        const context: ReservationContext = { actor: { ...application.user, organisationId: application.organisation.id, propertyId: property.id }, property };
        results.push(await this.syncOne(context, mutation));
      } catch (error) {
        const domain = error instanceof DomainError ? error : null;
        results.push({ clientMutationId: mutation.clientMutationId, status: 'FAILED', error: { code: domain?.code ?? 'SYNC_FAILED', message: domain?.message ?? 'Offline mutation could not be synchronized.' } });
      }
    }
    return { results };
  }

  private async syncOne(context: ReservationContext, mutation: OfflineSyncMutationInput): Promise<SyncItemResult> {
    try { assertSafeOfflinePayload(mutation.payload); } catch (error) { return { clientMutationId: mutation.clientMutationId, status: 'FAILED', error: { code: 'SENSITIVE_PAYLOAD_REJECTED', message: error instanceof Error ? error.message : 'Sensitive payload rejected.' } }; }
    if (!offlineSyncCommand.safeParse(mutation.command).success) return { clientMutationId: mutation.clientMutationId, status: 'FAILED', error: { code: 'OFFLINE_COMMAND_NOT_ALLOWED', message: 'This command requires an online connection.' } };
    const db = getDb(), payloadHash = hash({ command: mutation.command, entityType: mutation.entityType, entityId: mutation.entityId, payload: mutation.payload });
    const existing = (await db.select().from(offlineSyncMutations).where(and(eq(offlineSyncMutations.organisationId, context.actor.organisationId), eq(offlineSyncMutations.clientMutationId, mutation.clientMutationId))).limit(1))[0];
    if (existing) return this.replay(existing, payloadHash, mutation.clientMutationId, context);
    const recordId = crypto.randomUUID(), timestamp = new Date().toISOString();
    try {
      await db.insert(offlineSyncMutations).values({ id: recordId, organisationId: context.actor.organisationId, propertyId: context.property.id, userId: context.actor.id, clientMutationId: mutation.clientMutationId, command: mutation.command, entityType: mutation.entityType, entityId: mutation.entityId ?? null, payloadHash, status: 'PROCESSING', createdAt: timestamp });
    } catch (error) {
      if ((error as { cause?: { code?: string }; code?: string }).cause?.code !== '23505' && (error as { code?: string }).code !== '23505') throw error;
      const concurrent = (await db.select().from(offlineSyncMutations).where(and(eq(offlineSyncMutations.organisationId, context.actor.organisationId), eq(offlineSyncMutations.clientMutationId, mutation.clientMutationId))).limit(1))[0];
      if (!concurrent) throw error;
      return this.replay(concurrent, payloadHash, mutation.clientMutationId, context);
    }
    try {
      const applied = await this.execute(context, mutation), completedAt = new Date().toISOString();
      const result: SyncItemResult = { clientMutationId: mutation.clientMutationId, status: 'SYNCED', serverEntityId: applied.serverEntityId, result: applied.result };
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), timestamp: completedAt, actorId: context.actor.id, actorName: context.actor.name, role: context.actor.role, propertyId: context.property.id, deviceId: null, action: 'OFFLINE_MUTATION_SYNCED', entity: mutation.entityType, entityId: applied.serverEntityId ?? mutation.entityId ?? mutation.clientMutationId, previousValue: null, newValue: JSON.stringify({ command: mutation.command, clientMutationId: mutation.clientMutationId, status: 'SYNCED' }), source: 'PRODUCTION_OFFLINE_SYNC', correlationId: mutation.clientMutationId });
      await db.update(offlineSyncMutations).set({ status: 'SYNCED', resultJson: JSON.stringify(result), completedAt }).where(eq(offlineSyncMutations.id, recordId));
      return result;
    } catch (error) {
      const domain = error instanceof DomainError ? error : null, conflict = Boolean(domain && (domain.status === 409 || ['NOT_FOUND', 'RESERVATION_NOT_FOUND'].includes(domain.code)));
      const result: SyncItemResult = conflict ? { clientMutationId: mutation.clientMutationId, status: 'CONFLICT', conflict: { code: domain!.code, message: domain!.message } } : { clientMutationId: mutation.clientMutationId, status: 'FAILED', error: { code: domain?.code ?? 'SYNC_FAILED', message: domain?.message ?? 'Offline mutation could not be synchronized.' } };
      await db.update(offlineSyncMutations).set({ status: result.status, errorJson: JSON.stringify(result), completedAt: new Date().toISOString() }).where(eq(offlineSyncMutations.id, recordId));
      return result;
    }
  }

  private replay(existing: typeof offlineSyncMutations.$inferSelect, payloadHash: string, clientMutationId: string, context: ReservationContext): SyncItemResult {
    if(existing.propertyId!==context.property.id||existing.userId!==context.actor.id) return {clientMutationId,status:"FAILED",error:{code:"FORBIDDEN",message:"This mutation belongs to another session scope."}};
    if (existing.payloadHash !== payloadHash) return { clientMutationId, status: 'CONFLICT', conflict: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'This client mutation ID was already used with different data.' } };
    if (existing.status === 'SYNCED') return parse<SyncItemResult>(existing.resultJson) ?? { clientMutationId, status: 'SYNCED' };
    if (existing.status === 'CONFLICT') return parse<SyncItemResult>(existing.errorJson) ?? { clientMutationId, status: 'CONFLICT', conflict: { code: 'SYNC_CONFLICT', message: 'This mutation needs review.' } };
    if (existing.status === 'FAILED') return parse<SyncItemResult>(existing.errorJson) ?? { clientMutationId, status: 'FAILED', error: { code: 'SYNC_FAILED', message: 'This mutation failed previously.' } };
    return { clientMutationId, status: 'CONFLICT', conflict: { code: 'SYNC_IN_PROGRESS', message: 'This mutation is already being processed. Check its result before retrying.' } };
  }

  private async execute(context: ReservationContext, mutation: OfflineSyncMutationInput) {
    if (mutation.command === 'RECORD_HOUSEKEEPING_OUTCOME') {
      if (mutation.entityType !== 'HOUSEKEEPING_TASK' || !mutation.entityId) throw new DomainError('INVALID_SYNC_ENTITY', 'A housekeeping task ID is required.', 400);
      const result = await mutateOperations(context, { ...mutation.payload, action: mutation.command, taskId: mutation.entityId });
      return { serverEntityId: mutation.entityId, result };
    }
    if (mutation.command === 'SYNC_OFFLINE_RESERVATION') {
      if (mutation.entityType !== 'RESERVATION') throw new DomainError('INVALID_SYNC_ENTITY', 'Reservation entity type is required.', 400);
      const payload = mutation.payload, roomType = String(payload.roomType ?? ''), arrivalDate = String(payload.arrivalDate ?? ''), departureDate = String(payload.departureDate ?? '');
      const candidates = await getDb().select().from(rooms).where(and(eq(rooms.propertyId, context.property.id), eq(rooms.roomType, roomType), eq(rooms.active, true)));
      const service = new ReservationService(productionReservationRepository());
      let room = null;
      for (const candidate of candidates) if ((await service.availability(context, candidate.id, arrivalDate, departureDate)).available) { room = candidate; break; }
      if (!room) throw new DomainError('ROOM_NOT_AVAILABLE', 'No room of the requested type is currently available. Review this walk-in.', 409);
      const reservation = await service.create(context, { guestName: String(payload.guestName ?? ''), email: String(payload.email ?? ''), phone: String(payload.phone ?? ''), roomId: room.id, roomType, arrivalDate, departureDate, adults: Number(payload.guestCount ?? 1), children: 0, status: 'CONFIRMED', source: 'WALK_IN', sourceReference: String(payload.localReference ?? mutation.clientMutationId), nightlyRatePaise: room.baseRatePaise, taxRateBps: 0, specialRequests: String(payload.dietaryRequirements ?? '') });
      await new BillingService().ensureFolio(context, reservation.id);
      return { serverEntityId: reservation.id, result: { reservationId: reservation.id, reference: reservation.reference } };
    }
    throw new DomainError('OFFLINE_COMMAND_NOT_ALLOWED', 'This command requires an online connection.', 400);
  }
}
