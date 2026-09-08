import { DomainError, assertRoleCan, calculateStayNights, roleCan, validateStayDates } from '@/lib/domain';
import { reservationBlocksAvailability } from './availability';
import { assertReservationTransition, availableReservationActions } from './transitions';
import type { ReservationAction, ReservationChanges, ReservationContext, ReservationCreate, ReservationEdit, ReservationEventType, ReservationListQuery, ReservationRecord, ReservationRepository, ReservationStatus, RoomRecord } from './types';

function propertyToday(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function total(rate: number, taxBps: number, arrival: string, departure: string): number {
  const subtotal = rate * calculateStayNights(arrival, departure);
  return subtotal + Math.round(subtotal * taxBps / 10_000);
}
function assertRoom(room: RoomRecord | null, context: ReservationContext, roomType: string): asserts room is RoomRecord {
  if (!room || room.propertyId !== context.property.id) throw new DomainError('ROOM_PROPERTY_MISMATCH', 'The selected room does not belong to this property.', 403);
  if (!room.active || !['READY', 'CLEAN'].includes(room.operationalStatus)) throw new DomainError('ROOM_NOT_BOOKABLE', 'The selected room is not eligible for booking.', 409);
  if (room.roomType !== roomType) throw new DomainError('ROOM_TYPE_MISMATCH', 'The selected room does not match the selected room type.', 409);
}
export class ReservationService {
  constructor(private readonly repository: ReservationRepository, private readonly clock: () => Date = () => new Date()) {}
  private context(context: ReservationContext, permission: 'reservation.read' | 'reservation.write' | 'reservation.override' = 'reservation.read') {
    assertRoleCan(context.actor.role, permission);
    if (!context.actor.propertyId || context.actor.propertyId !== context.property.id || context.actor.organisationId !== context.property.organisationId) {
      throw new DomainError('PROPERTY_ACCESS_DENIED', 'An active property context is required.', 403);
    }
  }
  async list(context: ReservationContext, query: ReservationListQuery) { this.context(context); return this.repository.list(context, query); }
  async get(context: ReservationContext, id: string) { this.context(context); const item = await this.repository.find(context, id); if (!item) throw new DomainError('RESERVATION_NOT_FOUND', 'Reservation was not found.', 404); return { ...item, actions: availableReservationActions(item.status, roleCan(context.actor.role, 'reservation.override')) }; }
  async history(context: ReservationContext, id: string) { await this.get(context, id); return this.repository.history(context, id); }
  async availability(context: ReservationContext, roomId: string, arrival: string, departure: string, excludeId?: string) {
    this.context(context); validateStayDates(arrival, departure); const room = await this.repository.findRoom(context, roomId);
    if (!room || room.propertyId !== context.property.id) throw new DomainError('ROOM_PROPERTY_MISMATCH', 'The selected room does not belong to this property.', 403);
    const conflicts = (await this.repository.conflicts(context, roomId, arrival, departure, excludeId)).filter((item) => reservationBlocksAvailability(item, this.clock()));
    return { available: conflicts.length === 0, conflicts: conflicts.map((item) => ({ id: item.id, reference: item.reference, arrivalDate: item.arrivalDate, departureDate: item.departureDate })) };
  }
  async create(context: ReservationContext, input: ReservationCreate) {
    this.context(context, 'reservation.write'); validateStayDates(input.arrivalDate, input.departureDate);
    if (input.status === 'HOLD' && input.holdUntil && new Date(input.holdUntil) <= this.clock()) throw new DomainError('HOLD_EXPIRED', 'Hold expiry must be in the future.', 400);
    return this.repository.atomic(`${context.property.id}:${input.roomId}`, async (repository) => {
      const scoped = new ReservationService(repository, this.clock); const room = await repository.findRoom(context, input.roomId); assertRoom(room, context, input.roomType);
      if (!(await scoped.availability(context, room.id, input.arrivalDate, input.departureDate)).available) throw new DomainError('ROOM_NOT_AVAILABLE', 'The selected room is not available for these dates.', 409);
      const now = this.clock().toISOString(); const reference = await repository.nextReference(context);
      const reservation = await repository.create(context, { ...input, id: crypto.randomUUID(), reference, estimatedTotalPaise: total(input.nightlyRatePaise, input.taxRateBps, input.arrivalDate, input.departureDate), now });
      await repository.addEvent(context, reservation, 'RESERVATION_CREATED', null, { status: reservation.status }); return reservation;
    });
  }
  async edit(context: ReservationContext, id: string, input: ReservationEdit) {
    this.context(context, 'reservation.write'); const current = await this.get(context, id);
    if ((input.nightlyRatePaise !== undefined || input.taxRateBps !== undefined) && !roleCan(context.actor.role, 'reservation.override')) {
      throw new DomainError('RATE_OVERRIDE_FORBIDDEN', 'Only an owner or manager can change an agreed rate.', 403);
    }
    if (current.status === 'CHECKED_OUT' || current.status === 'CANCELLED' || current.status === 'NO_SHOW') throw new DomainError('RESERVATION_LOCKED', 'This reservation can no longer be edited.', 409);
    if (current.status === 'CHECKED_IN' && Object.keys(input).some((key) => !['specialRequests', 'internalNotes', 'adults', 'children'].includes(key))) throw new DomainError('RESERVATION_LOCKED', 'Only guest count and notes can change after check-in.', 409);
    const changes: ReservationChanges = { ...input, estimatedTotalPaise: total(input.nightlyRatePaise ?? current.nightlyRatePaise, input.taxRateBps ?? current.taxRateBps, current.arrivalDate, current.departureDate) };
    const updated = await this.repository.update(context, current, changes, this.clock().toISOString()); await this.repository.addEvent(context, updated, 'RESERVATION_UPDATED', current.status, { fields: Object.keys(input) }); return updated;
  }
  async action(context: ReservationContext, id: string, action: ReservationAction) {
    this.context(context, action.type === 'RESTORE' ? 'reservation.override' : 'reservation.write');
    const current = await this.get(context, id); const lockRoom = 'roomId' in action ? action.roomId : current.roomId;
    return this.repository.atomic(`${context.property.id}:${lockRoom ?? id}`, async (repository) => this.performAction(new ReservationService(repository, this.clock), repository, context, current, action));
  }
  private async performAction(scoped: ReservationService, repository: ReservationRepository, context: ReservationContext, current: ReservationRecord, action: ReservationAction) {
    const now = this.clock(); let changes: ReservationChanges = {}; let event: ReservationEventType = 'STATUS_CHANGED'; let nextStatus: ReservationStatus = current.status; let metadata: Record<string, unknown> = {};
    if (action.type === 'CHANGE_DATES' || action.type === 'EXTEND_STAY' || action.type === 'SHORTEN_STAY') {
      if (current.status === 'CHECKED_OUT' || current.status === 'CANCELLED' || current.status === 'NO_SHOW') throw new DomainError('RESERVATION_LOCKED', 'Stay dates cannot be changed for this reservation.', 409);
      const arrival = action.type === 'CHANGE_DATES' ? action.arrivalDate : current.arrivalDate; const departure = action.departureDate; validateStayDates(arrival, departure);
      if (action.type === 'EXTEND_STAY' && departure <= current.departureDate) throw new DomainError('INVALID_STAY_DATES', 'Extended checkout must be later.', 400);
      if (action.type === 'SHORTEN_STAY' && departure >= current.departureDate) throw new DomainError('INVALID_STAY_DATES', 'Shortened checkout must be earlier.', 400);
      if (current.roomId && !(await scoped.availability(context, current.roomId, arrival, departure, current.id)).available) throw new DomainError('ROOM_NOT_AVAILABLE', 'The current room is not available for the changed dates.', 409);
      changes = { arrivalDate: arrival, departureDate: departure, estimatedTotalPaise: total(current.nightlyRatePaise, current.taxRateBps, arrival, departure) };
      event = action.type === 'EXTEND_STAY' ? 'STAY_EXTENDED' : action.type === 'SHORTEN_STAY' ? 'STAY_SHORTENED' : 'DATES_CHANGED'; metadata = { oldArrivalDate: current.arrivalDate, oldDepartureDate: current.departureDate, arrivalDate: arrival, departureDate: departure };
    } else if (action.type === 'CHANGE_ROOM' || action.type === 'UPGRADE_ROOM') {
      if (!['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(current.status)) throw new DomainError('RESERVATION_LOCKED', 'Room cannot be changed for this reservation.', 409);
      const room = await repository.findRoom(context, action.roomId); assertRoom(room, context, action.roomType);
      if (action.nightlyRatePaise !== undefined && !roleCan(context.actor.role, 'reservation.override')) throw new DomainError('RATE_OVERRIDE_FORBIDDEN', 'Only an owner or manager can change an agreed rate.', 403);
      if (!(await scoped.availability(context, room.id, current.arrivalDate, current.departureDate, current.id)).available) throw new DomainError('ROOM_NOT_AVAILABLE', 'The destination room is not available.', 409);
      const rate = action.nightlyRatePaise ?? current.nightlyRatePaise; changes = { roomId: room.id, roomType: room.roomType, nightlyRatePaise: rate, estimatedTotalPaise: total(rate, current.taxRateBps, current.arrivalDate, current.departureDate) };
      event = action.type === 'UPGRADE_ROOM' ? 'ROOM_UPGRADED' : 'ROOM_CHANGED'; metadata = { oldRoomId: current.roomId, newRoomId: room.id, oldRoomType: current.roomType, newRoomType: room.roomType, oldNightlyRatePaise: current.nightlyRatePaise, newNightlyRatePaise: rate };
    } else if (action.type === 'PLACE_HOLD') { assertReservationTransition(current.status, 'HOLD'); if (action.holdUntil && new Date(action.holdUntil) <= now) throw new DomainError('HOLD_EXPIRED', 'Hold expiry must be in the future.', 400); nextStatus = 'HOLD'; changes = { status: nextStatus, holdUntil: action.holdUntil ?? null }; event = 'HOLD_PLACED'; }
    else if (action.type === 'RELEASE_HOLD') { assertReservationTransition(current.status, 'CONFIRMED'); if (current.holdUntil && new Date(current.holdUntil) <= now) throw new DomainError('HOLD_EXPIRED', 'This hold has expired and must be reviewed.', 409); if (current.roomId && !(await scoped.availability(context, current.roomId, current.arrivalDate, current.departureDate, current.id)).available) throw new DomainError('ROOM_NOT_AVAILABLE', 'The room is no longer available.', 409); nextStatus = 'CONFIRMED'; changes = { status: nextStatus, holdUntil: null }; event = 'HOLD_RELEASED'; }
    else if (action.type === 'CANCEL') { assertReservationTransition(current.status, 'CANCELLED'); nextStatus = 'CANCELLED'; changes = { status: nextStatus, cancellationReason: action.reason, cancelledAt: now.toISOString(), cancelledBy: context.actor.id, holdUntil: null }; event = 'CANCELLED'; }
    else if (action.type === 'MARK_NO_SHOW') { assertReservationTransition(current.status, 'NO_SHOW'); if (current.arrivalDate > propertyToday(context.property.timezone, now)) throw new DomainError('NO_SHOW_TOO_EARLY', 'No-show is only available on or after the arrival date.', 409); nextStatus = 'NO_SHOW'; changes = { status: nextStatus, noShowAt: now.toISOString(), noShowBy: context.actor.id }; event = 'NO_SHOW'; }
    else if (action.type === 'RESTORE') { assertReservationTransition(current.status, 'CONFIRMED'); if (current.roomId && !(await scoped.availability(context, current.roomId, current.arrivalDate, current.departureDate, current.id)).available) throw new DomainError('ROOM_NOT_AVAILABLE', 'The room has since been booked.', 409); nextStatus = 'CONFIRMED'; changes = { status: nextStatus, cancellationReason: null, cancelledAt: null, cancelledBy: null, noShowAt: null, noShowBy: null }; event = 'RESTORED'; }
    else if (action.type === 'CHECK_IN') { assertReservationTransition(current.status, 'CHECKED_IN'); nextStatus = 'CHECKED_IN'; changes = { status: nextStatus }; event = 'CHECKED_IN'; }
    else if (action.type === 'CHECK_OUT') { assertReservationTransition(current.status, 'CHECKED_OUT'); nextStatus = 'CHECKED_OUT'; changes = { status: nextStatus }; event = 'CHECKED_OUT'; }
    const updated = await repository.update(context, current, changes, now.toISOString()); await repository.addEvent(context, updated, event, current.status, metadata); return updated;
  }
  async expireReservationHolds(context: ReservationContext) {
    this.context(context, 'reservation.override'); const now = this.clock().toISOString(); const expired = await this.repository.expiredHolds(context, now);
    for (const reservation of expired) {
      const updated = await this.repository.update(context, reservation, { status: 'PENDING', holdUntil: null }, now);
      await this.repository.addEvent(context, updated, 'STATUS_CHANGED', 'HOLD', { reason: 'HOLD_EXPIRED' });
    }
    return { expired: expired.length, note: 'Scheduled invocation is deferred; this function is ready for an authenticated worker.' };
  }
}
