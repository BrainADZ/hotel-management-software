import { z } from 'zod';
import { reservationSources, reservationStatuses } from './types';

const date = z.iso.date();
export const entityIdSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/, 'Invalid identifier.');
const optionalText = (max: number) => z.string().trim().max(max).optional();
export const reservationCreateSchema = z.object({
  guestName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(320).optional().or(z.literal('')),
  phone: optionalText(32), roomId: entityIdSchema, roomType: z.string().trim().min(1).max(80),
  arrivalDate: date, departureDate: date, adults: z.number().int().min(1).max(20), children: z.number().int().min(0).max(20),
  status: z.enum(['PENDING', 'HOLD', 'CONFIRMED']).default('CONFIRMED'), source: z.enum(reservationSources), sourceReference: optionalText(100),
  nightlyRateRupees: z.number().multipleOf(0.01).min(0).max(1000000), taxRateBps: z.number().int().min(0).max(10_000).default(0),
  specialRequests: optionalText(2000), internalNotes: optionalText(2000), holdUntil: z.iso.datetime().optional(),
});
export const reservationEditSchema = reservationCreateSchema.pick({ guestName: true, email: true, phone: true, adults: true, children: true,
  source: true, sourceReference: true, nightlyRateRupees: true, taxRateBps: true, specialRequests: true, internalNotes: true }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one editable field is required.');
export const reservationActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CHANGE_DATES'), arrivalDate: date, departureDate: date }),
  z.object({ type: z.enum(['EXTEND_STAY', 'SHORTEN_STAY']), departureDate: date }),
  z.object({ type: z.enum(['CHANGE_ROOM', 'UPGRADE_ROOM']), roomId: entityIdSchema, roomType: z.string().min(1).max(80), nightlyRateRupees: z.number().multipleOf(0.01).min(0).max(1000000).optional() }),
  z.object({ type: z.literal('PLACE_HOLD'), holdUntil: z.iso.datetime().optional() }),
  z.object({ type: z.enum(['RELEASE_HOLD', 'RESTORE', 'CHECK_IN', 'CHECK_OUT']) }),
  z.object({ type: z.literal('CANCEL'), reason: z.string().trim().min(3).max(500) }),
  z.object({ type: z.literal('MARK_NO_SHOW') }),
]);
export const reservationListSchema = z.object({ status: z.enum(reservationStatuses).optional(), arrivalDate: date.optional(), departureDate: date.optional(),
  search: z.string().trim().max(120).optional(), room: z.string().trim().max(30).optional(), source: z.enum(reservationSources).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
