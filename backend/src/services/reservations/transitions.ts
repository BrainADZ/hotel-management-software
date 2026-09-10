import { DomainError } from '@hotel/shared/domain';
import type { ReservationStatus } from './types';

const transitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  PENDING: ['HOLD', 'CONFIRMED', 'CANCELLED'], HOLD: ['PENDING', 'CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['HOLD', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'], CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [], CANCELLED: ['CONFIRMED'], NO_SHOW: ['CONFIRMED'],
};
export function assertReservationTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!transitions[from].includes(to)) throw new DomainError('INVALID_STATUS_TRANSITION', `${from} cannot transition to ${to}.`, 409);
}
export function availableReservationActions(status: ReservationStatus, canOverride: boolean): string[] {
  if (status === 'CONFIRMED') return ['EDIT', 'CHANGE_DATES', 'CHANGE_ROOM', 'UPGRADE_ROOM', 'PLACE_HOLD', 'CANCEL', 'MARK_NO_SHOW', 'CHECK_IN'];
  if (status === 'HOLD') return ['EDIT', 'RELEASE_HOLD', 'CANCEL'];
  if (status === 'CHECKED_IN') return ['EDIT', 'EXTEND_STAY', 'SHORTEN_STAY', 'CHANGE_ROOM', 'UPGRADE_ROOM', 'CHECK_OUT'];
  if ((status === 'CANCELLED' || status === 'NO_SHOW') && canOverride) return ['RESTORE'];
  return status === 'PENDING' ? ['EDIT', 'CHANGE_DATES', 'CHANGE_ROOM', 'PLACE_HOLD', 'CANCEL'] : [];
}
