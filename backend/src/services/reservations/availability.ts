import type { ReservationRecord } from './types';

export const blockingReservationStatuses = new Set(['HOLD', 'CONFIRMED', 'CHECKED_IN']);
export function stayDatesOverlap(existingArrival: string, existingDeparture: string, requestedArrival: string, requestedDeparture: string): boolean {
  return existingArrival < requestedDeparture && existingDeparture > requestedArrival;
}
export function reservationBlocksAvailability(reservation: Pick<ReservationRecord, 'status' | 'holdUntil'>, now = new Date()): boolean {
  if (!blockingReservationStatuses.has(reservation.status)) return false;
  return reservation.status !== 'HOLD' || !reservation.holdUntil || new Date(reservation.holdUntil).getTime() > now.getTime();
}
