import { describe, expect, it } from 'vitest';
import { createFollowUpSchema, createInquirySchema, createPackageSchema, discountDecisionSchema, packagePricingSchema, updateFollowUpSchema, updateInquirySchema } from './validation';

describe('Travel production contracts', () => {
  it('validates persisted inquiry creation and pipeline updates', () => {
    expect(createInquirySchema.parse({ customerName: 'Rhea Sharma', source: 'Website', owner: 'Neha', service: 'Rajasthan tour', estimatedValuePaise: 4800000, status: 'NEW' }).estimatedValuePaise).toBe(4800000);
    expect(updateInquirySchema.parse({ status: 'NEGOTIATION' }).status).toBe('NEGOTIATION');
  });
  it('validates package creation and whole-paise pricing', () => {
    expect(createPackageSchema.parse({ clientName: 'Rhea Sharma', name: 'Rajasthan Escape', quotedPricePaise: 500000, assetSelections: [{ assetId: 'asset-1', quantity: 2 }] }).assetSelections).toHaveLength(1);
    expect(packagePricingSchema.parse({ basePricePaise: 500000, floorPricePaise: 450000 })).toMatchObject({ floorPricePaise: 450000 });
    expect(() => packagePricingSchema.parse({ basePricePaise: 10.5, floorPricePaise: 5 })).toThrow();
  });
  it('validates discount decisions', () => expect(discountDecisionSchema.parse({ decision: 'APPROVED' }).decision).toBe('APPROVED'));
  it('validates follow-up creation and versioned completion', () => {
    expect(createFollowUpSchema.parse({ inquiryId: 'inq-1', channel: 'CALL', dueAt: '2026-09-11T10:00:00.000Z', assignedToName: 'Neha' }).channel).toBe('CALL');
    expect(updateFollowUpSchema.parse({ status: 'COMPLETED', expectedVersion: 1 }).status).toBe('COMPLETED');
  });
});
