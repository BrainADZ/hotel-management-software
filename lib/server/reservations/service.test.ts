import { describe, expect, it } from 'vitest';
import type { AppRole } from '@/lib/domain';
import { reservationBlocksAvailability, stayDatesOverlap } from './availability';
import { ReservationService } from './service';
import type { ReservationChanges, ReservationContext, ReservationCreate, ReservationEventRecord, ReservationEventType, ReservationListQuery, ReservationRecord, ReservationRepository, ReservationStatus, RoomRecord } from './types';

const now = new Date('2026-09-12T06:00:00.000Z');
const rooms: RoomRecord[] = [
  { id: 'room-101', propertyId: 'property-a', number: '101', roomType: 'Standard', baseRatePaise: 500_000, active: true, operationalStatus: 'READY' },
  { id: 'room-201', propertyId: 'property-a', number: '201', roomType: 'Deluxe', baseRatePaise: 800_000, active: true, operationalStatus: 'CLEAN' },
  { id: 'foreign-room', propertyId: 'property-b', number: '1', roomType: 'Standard', baseRatePaise: 1, active: true, operationalStatus: 'READY' },
];
function context(role: AppRole = 'MANAGER', organisationId = 'org-a', propertyId = 'property-a'): ReservationContext {
  return { actor: { id: `user-${role}`, name: role, email: `${role}@example.test`, role, organisationId, propertyId },
    property: { id: propertyId, organisationId, name: 'Hotel', code: 'HOT', timezone: 'Asia/Kolkata' } };
}
function input(overrides: Partial<ReservationCreate> = {}): ReservationCreate {
  return { guestName: 'Guest One', email: 'guest@example.test', phone: '9999999999', roomId: 'room-101', roomType: 'Standard',
    arrivalDate: '2026-09-12', departureDate: '2026-09-14', adults: 2, children: 0, status: 'CONFIRMED', source: 'DIRECT',
    nightlyRatePaise: 500_000, taxRateBps: 1200, ...overrides };
}
class MemoryRepository implements ReservationRepository {
  reservations: ReservationRecord[] = []; events: ReservationEventRecord[] = []; sequence = 1;
  async atomic<T>(_key: string, work: (repository: ReservationRepository) => Promise<T>): Promise<T> { return work(this); }
  async list(ctx: ReservationContext, query: ReservationListQuery) { const all = this.reservations.filter((item) => item.organisationId === ctx.actor.organisationId && item.propertyId === ctx.property.id); return { items: all, page: query.page, pageSize: query.pageSize, total: all.length }; }
  async find(ctx: ReservationContext, id: string) { return this.reservations.find((item) => item.id === id && item.organisationId === ctx.actor.organisationId && item.propertyId === ctx.property.id) ?? null; }
  async findRoom(ctx: ReservationContext, id: string) { return rooms.find((room) => room.id === id && room.propertyId === ctx.property.id) ?? null; }
  async conflicts(ctx: ReservationContext, roomId: string, arrivalDate: string, departureDate: string, excludeId?: string) { return this.reservations.filter((item) => item.organisationId === ctx.actor.organisationId && item.propertyId === ctx.property.id && item.roomId === roomId && item.id !== excludeId && stayDatesOverlap(item.arrivalDate, item.departureDate, arrivalDate, departureDate)); }
  async expiredHolds(ctx: ReservationContext, before: string) { return this.reservations.filter((item) => item.organisationId === ctx.actor.organisationId && item.propertyId === ctx.property.id && item.status === 'HOLD' && Boolean(item.holdUntil && item.holdUntil < before)); }
  async nextReference() { return `RES-2026-${String(this.sequence++).padStart(6, '0')}`; }
  async create(ctx: ReservationContext, value: ReservationCreate & { id: string; reference: string; estimatedTotalPaise: number; now: string }) {
    const record: ReservationRecord = { id: value.id, organisationId: ctx.actor.organisationId, propertyId: ctx.property.id, reference: value.reference,
      guestId: crypto.randomUUID(), primaryGuestName: value.guestName, guestEmail: value.email ?? null, guestPhone: value.phone ?? null,
      roomId: value.roomId, roomNumber: rooms.find((room) => room.id === value.roomId)?.number ?? null, roomType: value.roomType,
      arrivalDate: value.arrivalDate, departureDate: value.departureDate, adults: value.adults, children: value.children, status: value.status,
      source: value.source, sourceReference: value.sourceReference ?? null, nightlyRatePaise: value.nightlyRatePaise, taxRateBps: value.taxRateBps,
      estimatedTotalPaise: value.estimatedTotalPaise, specialRequests: value.specialRequests ?? null, internalNotes: value.internalNotes ?? null,
      holdUntil: value.holdUntil ?? null, cancellationReason: null, cancelledAt: null, cancelledBy: null, noShowAt: null, noShowBy: null,
      createdBy: ctx.actor.id, updatedBy: ctx.actor.id, createdAt: value.now, updatedAt: value.now, version: 1 };
    this.reservations.push(record); return record;
  }
  async update(ctx: ReservationContext, reservation: ReservationRecord, changes: ReservationChanges, updatedAt: string) {
    const index = this.reservations.findIndex((item) => item.id === reservation.id && item.organisationId === ctx.actor.organisationId && item.propertyId === ctx.property.id);
    if (index < 0) throw new Error('not found');
    const updated = { ...reservation, ...changes, primaryGuestName: changes.guestName ?? reservation.primaryGuestName,
      guestEmail: changes.email === undefined ? reservation.guestEmail : changes.email, guestPhone: changes.phone === undefined ? reservation.guestPhone : changes.phone,
      updatedBy: ctx.actor.id, updatedAt, version: reservation.version + 1 } as ReservationRecord;
    this.reservations[index] = updated; return updated;
  }
  async addEvent(ctx: ReservationContext, reservation: ReservationRecord, eventType: ReservationEventType, previousStatus: ReservationStatus | null, metadata?: Record<string, unknown>) {
    this.events.push({ id: crypto.randomUUID(), eventType, previousStatus, newStatus: reservation.status, performedBy: ctx.actor.id, metadata: metadata ?? null, createdAt: now.toISOString() });
  }
  async history(_ctx: ReservationContext, reservationId: string) { return this.reservations.some((reservation) => reservation.id === reservationId) ? this.events : []; }
}
function setup(role: AppRole = 'MANAGER') { const repository = new MemoryRepository(); return { repository, service: new ReservationService(repository, () => now), ctx: context(role) }; }

describe('production reservation lifecycle', () => {
  it('creates a scoped reservation, snapshot total, reference and history', async () => {
    const { service, repository, ctx } = setup(); const created = await service.create(ctx, input());
    expect(created.reference).toBe('RES-2026-000001'); expect(created.estimatedTotalPaise).toBe(1_120_000); expect(repository.events[0]?.eventType).toBe('RESERVATION_CREATED');
  });
  it.each([['2026-09-12', '2026-09-12'], ['2026-09-13', '2026-09-12']])('rejects invalid stay dates %s to %s', async (arrivalDate, departureDate) => {
    await expect(setup().service.create(context(), input({ arrivalDate, departureDate }))).rejects.toMatchObject({ code: 'INVALID_STAY_DATES' });
  });
  it('rejects overlapping blocking reservations', async () => {
    const { service, ctx } = setup(); await service.create(ctx, input());
    await expect(service.create(ctx, input({ guestName: 'Guest Two', arrivalDate: '2026-09-13', departureDate: '2026-09-15' }))).rejects.toMatchObject({ code: 'ROOM_NOT_AVAILABLE' });
  });
  it('allows same-day checkout and check-in for the same room', async () => {
    const { service, ctx } = setup(); await service.create(ctx, input());
    await expect(service.create(ctx, input({ guestName: 'Guest Two', arrivalDate: '2026-09-14', departureDate: '2026-09-16' }))).resolves.toMatchObject({ primaryGuestName: 'Guest Two' });
  });
  it.each(['CANCELLED', 'NO_SHOW', 'CHECKED_OUT'] as const)('%s reservations do not block availability', async (status) => {
    const { service, repository, ctx } = setup(); const old = await service.create(ctx, input()); repository.reservations[0] = { ...old, status };
    await expect(service.create(ctx, input({ guestName: 'Replacement' }))).resolves.toBeDefined();
  });
  it('expired holds do not block availability and are not auto-confirmed', async () => {
    expect(reservationBlocksAvailability({ status: 'HOLD', holdUntil: '2026-09-11T00:00:00Z' }, now)).toBe(false);
    const { service, repository, ctx } = setup(); const held = await service.create(ctx, input({ status: 'HOLD', holdUntil: '2026-09-13T00:00:00Z' }));
    repository.reservations[0] = { ...held, holdUntil: '2026-09-11T00:00:00Z' };
    await expect(service.create(ctx, input({ guestName: 'Replacement' }))).resolves.toBeDefined(); expect(repository.reservations[0]?.status).toBe('HOLD');
  });
  it('provides a reusable owner/manager hold-expiration operation', async () => {
    const { service, repository, ctx } = setup(); const held = await service.create(ctx, input({ status: 'HOLD', holdUntil: '2026-09-13T00:00:00Z' }));
    repository.reservations[0] = { ...held, holdUntil: '2026-09-11T00:00:00Z' };
    await expect(service.expireReservationHolds(context('RECEPTION'))).rejects.toMatchObject({ status: 403 });
    expect(await service.expireReservationHolds(ctx)).toMatchObject({ expired: 1 });
    expect(repository.reservations[0]).toMatchObject({ status: 'PENDING', holdUntil: null });
  });
  it('edits guest count and notes with history', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const updated = await service.edit(ctx, item.id, { adults: 3, children: 1, specialRequests: 'Late arrival' });
    expect(updated).toMatchObject({ adults: 3, children: 1, specialRequests: 'Late arrival' }); expect(repository.events.at(-1)?.eventType).toBe('RESERVATION_UPDATED');
  });
  it('allows only owner/manager to change the agreed rate after creation', async () => {
    const { service, ctx } = setup(); const item = await service.create(ctx, input());
    const reception = context('RECEPTION');
    await expect(service.edit(reception, item.id, { nightlyRatePaise: 600_000 })).rejects.toMatchObject({ code: 'RATE_OVERRIDE_FORBIDDEN' });
    await expect(service.edit(ctx, item.id, { nightlyRatePaise: 600_000 })).resolves.toMatchObject({ nightlyRatePaise: 600_000 });
  });
  it('changes dates after availability validation', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const updated = await service.action(ctx, item.id, { type: 'CHANGE_DATES', arrivalDate: '2026-09-15', departureDate: '2026-09-17' });
    expect(updated.departureDate).toBe('2026-09-17'); expect(repository.events.at(-1)?.eventType).toBe('DATES_CHANGED');
  });
  it('extends and shortens a stay and recalculates value', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const extended = await service.action(ctx, item.id, { type: 'EXTEND_STAY', departureDate: '2026-09-16' }); expect(extended.estimatedTotalPaise).toBe(2_240_000);
    const shortened = await service.action(ctx, item.id, { type: 'SHORTEN_STAY', departureDate: '2026-09-13' }); expect(shortened.estimatedTotalPaise).toBe(560_000);
    expect(repository.events.slice(-2).map((event) => event.eventType)).toEqual(['STAY_EXTENDED', 'STAY_SHORTENED']);
  });
  it('rejects an extension when the room is unavailable', async () => {
    const { service, repository, ctx } = setup(); const first = await service.create(ctx, input());
    repository.reservations.push({ ...first, id: 'other', reference: 'OTHER', arrivalDate: '2026-09-14', departureDate: '2026-09-17' });
    await expect(service.action(ctx, first.id, { type: 'EXTEND_STAY', departureDate: '2026-09-16' })).rejects.toMatchObject({ code: 'ROOM_NOT_AVAILABLE' });
  });
  it('changes rooms and records the old and new assignments', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const updated = await service.action(ctx, item.id, { type: 'CHANGE_ROOM', roomId: 'room-201', roomType: 'Deluxe' }); expect(updated.roomId).toBe('room-201');
    expect(repository.events.at(-1)).toMatchObject({ eventType: 'ROOM_CHANGED', metadata: { oldRoomId: 'room-101', newRoomId: 'room-201' } });
  });
  it('records upgrades and only changes an agreed rate when explicitly supplied', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const updated = await service.action(ctx, item.id, { type: 'UPGRADE_ROOM', roomId: 'room-201', roomType: 'Deluxe', nightlyRatePaise: 900_000 });
    expect(updated.nightlyRatePaise).toBe(900_000); expect(repository.events.at(-1)?.eventType).toBe('ROOM_UPGRADED');
  });
  it('places and releases a hold', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input({ status: 'PENDING' }));
    const held = await service.action(ctx, item.id, { type: 'PLACE_HOLD', holdUntil: '2026-09-13T00:00:00Z' }); expect(held.status).toBe('HOLD');
    const released = await service.action(ctx, item.id, { type: 'RELEASE_HOLD' }); expect(released.status).toBe('CONFIRMED');
    expect(repository.events.slice(-2).map((event) => event.eventType)).toEqual(['HOLD_PLACED', 'HOLD_RELEASED']);
  });
  it('requires a meaningful cancellation reason at validation boundary', async () => {
    const { reservationActionSchema } = await import('./validation'); expect(reservationActionSchema.safeParse({ type: 'CANCEL', reason: '' }).success).toBe(false);
  });
  it('cancels without deleting and makes the room available', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const cancelled = await service.action(ctx, item.id, { type: 'CANCEL', reason: 'Guest requested cancellation' }); expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Guest requested cancellation' });
    expect((await service.availability(ctx, 'room-101', item.arrivalDate, item.departureDate)).available).toBe(true); expect(repository.events.at(-1)?.eventType).toBe('CANCELLED');
  });
  it('marks an arrived confirmed reservation no-show', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input()); const noShow = await service.action(ctx, item.id, { type: 'MARK_NO_SHOW' });
    expect(noShow.status).toBe('NO_SHOW'); expect(repository.events.at(-1)?.eventType).toBe('NO_SHOW');
  });
  it('rejects no-show before the property-local arrival date', async () => {
    const { service, ctx } = setup(); const item = await service.create(ctx, input({ arrivalDate: '2026-09-13', departureDate: '2026-09-14' }));
    await expect(service.action(ctx, item.id, { type: 'MARK_NO_SHOW' })).rejects.toMatchObject({ code: 'NO_SHOW_TOO_EARLY' });
  });
  it('rejects invalid transitions and editing after checkout', async () => {
    const { service, ctx } = setup(); const item = await service.create(ctx, input()); const checkedIn = await service.action(ctx, item.id, { type: 'CHECK_IN' });
    const checkedOut = await service.action(ctx, checkedIn.id, { type: 'CHECK_OUT' });
    await expect(service.action(ctx, checkedOut.id, { type: 'CHECK_IN' })).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    await expect(service.edit(ctx, checkedOut.id, { adults: 1 })).rejects.toMatchObject({ code: 'RESERVATION_LOCKED' });
  });
  it('restores cancelled reservations only for owner/manager and rechecks availability', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input()); await service.action(ctx, item.id, { type: 'CANCEL', reason: 'Changed plans' });
    await expect(service.action(context('RECEPTION'), item.id, { type: 'RESTORE' })).rejects.toMatchObject({ status: 403 });
    repository.reservations.push({ ...item, id: 'replacement', reference: 'OTHER' });
    await expect(service.action(ctx, item.id, { type: 'RESTORE' })).rejects.toMatchObject({ code: 'ROOM_NOT_AVAILABLE' });
  });
  it('rejects cross-property rooms and cross-organisation reservations', async () => {
    const { service, ctx } = setup(); await expect(service.create(ctx, input({ roomId: 'foreign-room' }))).rejects.toMatchObject({ code: 'ROOM_PROPERTY_MISMATCH' });
    const item = await service.create(ctx, input()); await expect(service.get(context('MANAGER', 'org-b', 'property-b'), item.id)).rejects.toMatchObject({ code: 'RESERVATION_NOT_FOUND' });
  });
  it('prevents reporting users from reading or mutating reservation data', async () => {
    const { service } = setup('REPORTING'); await expect(service.list(context('REPORTING'), { page: 1, pageSize: 25 })).rejects.toMatchObject({ status: 403 });
    await expect(service.create(context('REPORTING'), input())).rejects.toMatchObject({ status: 403 });
  });
  it('preserves check-in and check-out as lifecycle events', async () => {
    const { service, repository, ctx } = setup(); const item = await service.create(ctx, input());
    const checkedIn = await service.action(ctx, item.id, { type: 'CHECK_IN' }); const checkedOut = await service.action(ctx, checkedIn.id, { type: 'CHECK_OUT' });
    expect(checkedOut.status).toBe('CHECKED_OUT'); expect(repository.events.slice(-2).map((event) => event.eventType)).toEqual(['CHECKED_IN', 'CHECKED_OUT']);
  });
  it('completes the production edit, dates, room, history and cancellation sequence', async () => {
    const { service, repository, ctx } = setup();
    let item = await service.create(ctx, input());
    item = await service.edit(ctx, item.id, { adults: 3, internalNotes: 'VIP arrival' });
    item = await service.action(ctx, item.id, { type: 'CHANGE_DATES', arrivalDate: '2026-09-15', departureDate: '2026-09-17' });
    item = await service.action(ctx, item.id, { type: 'CHANGE_ROOM', roomId: 'room-201', roomType: 'Deluxe' });
    item = await service.action(ctx, item.id, { type: 'CANCEL', reason: 'Guest changed plans' });
    expect(item.status).toBe('CANCELLED');
    expect(repository.events.map((event) => event.eventType)).toEqual(['RESERVATION_CREATED', 'RESERVATION_UPDATED', 'DATES_CHANGED', 'ROOM_CHANGED', 'CANCELLED']);
    expect((await service.availability(ctx, 'room-201', '2026-09-15', '2026-09-17')).available).toBe(true);
  });
  it('completes create, check-in, extend and check-out sequence', async () => {
    const { service, repository, ctx } = setup();
    let item = await service.create(ctx, input());
    item = await service.action(ctx, item.id, { type: 'CHECK_IN' });
    item = await service.action(ctx, item.id, { type: 'EXTEND_STAY', departureDate: '2026-09-16' });
    item = await service.action(ctx, item.id, { type: 'CHECK_OUT' });
    expect(item).toMatchObject({ status: 'CHECKED_OUT', departureDate: '2026-09-16' });
    expect(repository.events.slice(-3).map((event) => event.eventType)).toEqual(['CHECKED_IN', 'STAY_EXTENDED', 'CHECKED_OUT']);
  });
});
