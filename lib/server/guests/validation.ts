import { z } from 'zod';

const optionalText = z.string().trim().max(500).optional().nullable();
export const guestInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().max(100).optional().default(''),
  displayName: z.string().trim().max(200).optional(), phone: z.string().trim().min(6).max(30), alternatePhone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal('')), dateOfBirth: z.iso.date().optional(), nationality: optionalText,
  addressLine1: optionalText, addressLine2: optionalText, city: optionalText, state: optionalText, postalCode: optionalText,
  country: optionalText, companyName: optionalText, gstin: z.string().trim().max(20).optional().nullable(), notes: optionalText,
});
export const guestPatchSchema = guestInputSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const guestListSchema = z.object({ search: z.string().trim().max(100).optional().default(''), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const identityDocumentSchema = z.object({
  documentType: z.enum(['AADHAAR','PASSPORT','DRIVING_LICENCE','VOTER_ID','OTHER']),
  last4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/, 'Only the final 4 letters/digits are accepted.'),
  issuingCountry: z.string().trim().max(100).optional(), issuedAt: z.iso.date().optional(), expiresAt: z.iso.date().optional(), verified: z.boolean().default(false),
});

export function maskedIdentityNumber(type: string, last4: string): string {
  return type === 'AADHAAR' ? `XXXX XXXX ${last4.toUpperCase()}` : `••••${last4.toUpperCase()}`;
}
