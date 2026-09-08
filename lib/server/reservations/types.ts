import type { AppActor, PropertyContext } from '@/lib/server/auth/types';

export const reservationStatuses = ['PENDING', 'HOLD', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];
export const reservationSources = ['DIRECT', 'WALK_IN', 'PHONE', 'WEBSITE', 'OTA', 'TRAVEL_AGENT', 'CORPORATE', 'OTHER'] as const;
export type ReservationSource = (typeof reservationSources)[number];
export type ReservationEventType = 'RESERVATION_CREATED' | 'RESERVATION_UPDATED' | 'DATES_CHANGED' | 'ROOM_CHANGED' |
  'ROOM_UPGRADED' | 'STAY_EXTENDED' | 'STAY_SHORTENED' | 'STATUS_CHANGED' | 'HOLD_PLACED' | 'HOLD_RELEASED' |
  'CANCELLED' | 'NO_SHOW' | 'RESTORED' | 'CHECKED_IN' | 'CHECKED_OUT';

export type RoomRecord = { id: string; propertyId: string; number: string; roomType: string; baseRatePaise: number; active: boolean; operationalStatus: string };
export type ReservationRecord = {
  id: string; organisationId: string; propertyId: string; reference: string; guestId: string; primaryGuestName: string;
  guestEmail: string | null; guestPhone: string | null; roomId: string | null; roomNumber: string | null; roomType: string;
  arrivalDate: string; departureDate: string; adults: number; children: number; status: ReservationStatus; source: ReservationSource;
  sourceReference: string | null; nightlyRatePaise: number; taxRateBps: number; estimatedTotalPaise: number;
  specialRequests: string | null; internalNotes: string | null; holdUntil: string | null; cancellationReason: string | null;
  cancelledAt: string | null; cancelledBy: string | null; noShowAt: string | null; noShowBy: string | null;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string; version: number;
};
export type ReservationEventRecord = { id: string; eventType: ReservationEventType; previousStatus: ReservationStatus | null;
  newStatus: ReservationStatus | null; performedBy: string; metadata: Record<string, unknown> | null; createdAt: string };
export type ReservationListQuery = { status?: ReservationStatus; arrivalDate?: string; departureDate?: string; search?: string; room?: string; source?: ReservationSource; page: number; pageSize: number };
export type ReservationList = { items: ReservationRecord[]; page: number; pageSize: number; total: number };
export type ReservationContext = { actor: AppActor; property: PropertyContext };
export type ReservationCreate = { guestName: string; email?: string; phone?: string; roomId: string; roomType: string;
  arrivalDate: string; departureDate: string; adults: number; children: number; status: 'PENDING' | 'HOLD' | 'CONFIRMED';
  source: ReservationSource; sourceReference?: string; nightlyRatePaise: number; taxRateBps: number; specialRequests?: string; internalNotes?: string; holdUntil?: string };
export type ReservationEdit = Partial<Pick<ReservationCreate, 'guestName' | 'email' | 'phone' | 'adults' | 'children' | 'source' | 'sourceReference' | 'nightlyRatePaise' | 'taxRateBps' | 'specialRequests' | 'internalNotes'>>;
export type ReservationAction =
  | { type: 'CHANGE_DATES'; arrivalDate: string; departureDate: string }
  | { type: 'EXTEND_STAY' | 'SHORTEN_STAY'; departureDate: string }
  | { type: 'CHANGE_ROOM' | 'UPGRADE_ROOM'; roomId: string; roomType: string; nightlyRatePaise?: number }
  | { type: 'PLACE_HOLD'; holdUntil?: string }
  | { type: 'RELEASE_HOLD' | 'RESTORE' | 'CHECK_IN' | 'CHECK_OUT' }
  | { type: 'CANCEL'; reason: string }
  | { type: 'MARK_NO_SHOW' };

export type ReservationChanges = Partial<Omit<ReservationRecord, 'id' | 'organisationId' | 'propertyId' | 'reference' | 'guestId' | 'guestEmail' | 'guestPhone' | 'roomNumber' | 'createdAt'>> &
  { guestName?: string; email?: string | null; phone?: string | null };
export type ReservationRepository = {
  atomic<T>(key: string, work: (repository: ReservationRepository) => Promise<T>): Promise<T>;
  list(context: ReservationContext, query: ReservationListQuery): Promise<ReservationList>;
  find(context: ReservationContext, id: string): Promise<ReservationRecord | null>;
  findRoom(context: ReservationContext, id: string): Promise<RoomRecord | null>;
  conflicts(context: ReservationContext, roomId: string, arrivalDate: string, departureDate: string, excludeId?: string): Promise<ReservationRecord[]>;
  expiredHolds(context: ReservationContext, before: string): Promise<ReservationRecord[]>;
  nextReference(context: ReservationContext): Promise<string>;
  create(context: ReservationContext, input: ReservationCreate & { id: string; reference: string; estimatedTotalPaise: number; now: string }): Promise<ReservationRecord>;
  update(context: ReservationContext, reservation: ReservationRecord, changes: ReservationChanges, now: string): Promise<ReservationRecord>;
  addEvent(context: ReservationContext, reservation: ReservationRecord, eventType: ReservationEventType, previousStatus: ReservationStatus | null, metadata?: Record<string, unknown>): Promise<void>;
  history(context: ReservationContext, reservationId: string): Promise<ReservationEventRecord[]>;
};
