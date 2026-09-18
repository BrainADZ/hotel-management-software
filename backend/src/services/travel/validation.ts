import { z } from 'zod';

const id = z.string().trim().min(1).max(100);
const rupees = z.number().multipleOf(0.01).nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.string().datetime({ offset: true });
export const inquiryStatus = z.enum(['NEW', 'FOLLOW_UP', 'NEGOTIATION', 'CONVERTED', 'LOST']);

export const createInquirySchema = z.object({
  customerName: z.string().trim().min(2).max(160),
  source: z.string().trim().min(1).max(80),
  owner: z.string().trim().min(2).max(160),
  service: z.string().trim().min(2).max(240),
  estimatedValueRupees: rupees,
  status: inquiryStatus.default('NEW'),
  followUpAt: timestamp.nullish(),
  notes: z.string().trim().max(2000).nullish(),
});
export const updateInquirySchema = createInquirySchema.partial().extend({ expectedUpdatedAt: z.string().nullish() }).refine(value => Object.keys(value).some(key => key !== 'expectedUpdatedAt'), 'At least one change is required.');
export const createPackageSchema = z.object({
  clientName: z.string().trim().min(2).max(160), name: z.string().trim().min(3).max(200),
  assetSelections: z.array(z.object({ assetId: id, quantity: z.number().int().min(1).max(99) })).min(1).max(100),
  basePriceRupees: rupees.optional(), floorPriceRupees: rupees.optional(), quotedPriceRupees: rupees.positive(),
  discountReason: z.string().trim().max(1000).optional(),
});
export const packagePricingSchema = z.object({ basePriceRupees: rupees, floorPriceRupees: rupees, expectedVersion: z.number().int().positive().optional() });
export const discountDecisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), decisionNote: z.string().trim().max(1000).optional() });
export const createFollowUpSchema = z.object({ inquiryId: id, channel: z.enum(['CALL', 'EMAIL', 'WHATSAPP', 'VISIT', 'OTHER']), dueAt: timestamp, notes: z.string().trim().max(2000).nullish(), assignedToId: id.nullish(), assignedToName: z.string().trim().min(2).max(160) });
export const updateFollowUpSchema = z.object({ dueAt: timestamp.optional(), status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(), notes: z.string().trim().max(2000).nullish(), expectedVersion: z.number().int().positive() }).refine(value => value.dueAt !== undefined || value.status !== undefined || value.notes !== undefined, 'At least one change is required.');
