import { describe, expect, it } from 'vitest';
import {
  DomainError,
  assertPropertyMutationAllowed,
  businessUnitsForRole,
  calculateBill,
  calculatePolicyDamageCharge,
  calculateStayNights,
  createOfflineReference,
  createOfflineReservationReference,
  normalizeDamageSeverity,
  reconcileOfflineBill,
  resolveBusinessUnit,
  roleCan,
  validateStayDates,
} from './domain';

describe('billing calculations', () => {
  it('keeps financial values in integer paise', () => {
    expect(calculateBill(935_000, 1_800)).toEqual({
      subtotalPaise: 935_000,
      taxPaise: 168_300,
      totalPaise: 1_103_300,
    });
  });

  it('rejects invalid money and tax inputs', () => {
    expect(() => calculateBill(-1, 1_800)).toThrow(DomainError);
    expect(() => calculateBill(100, 10_001)).toThrow('Tax rate must be between');
  });
});

describe('Master Hub authority', () => {
  it('blocks property mutations while the property is offline', () => {
    expect(() => assertPropertyMutationAllowed(false, 'PROPERTY')).toThrow('requires a connection to Master Hub');
  });

  it('allows the authoritative Master Hub to continue during a property outage', () => {
    expect(() => assertPropertyMutationAllowed(false, 'MASTER_HUB')).not.toThrow();
  });
});

describe('offline continuity', () => {
  it('creates device-scoped, unique-looking local references', () => {
    expect(createOfflineReference(7, '2026-08-24')).toBe('BHZ-FD01-20260824-0007');
    expect(createOfflineReservationReference(3, '2026-08-24')).toBe('BHZ-WALKIN-20260824-0003');
  });

  it('never treats a missing or mismatched cloud folio as verified', () => {
    expect(reconcileOfflineBill({ localBookingReference: 'BH-100', localAmountPaise: 10_000 })).toBe('MASTER_RECORD_NOT_FOUND');
    expect(reconcileOfflineBill({ localBookingReference: 'BH-100', localAmountPaise: 10_000, cloudBookingReference: 'BH-100', cloudAmountPaise: 9_999 })).toBe('AMOUNT_MISMATCH');
    expect(reconcileOfflineBill({ localBookingReference: 'BH-100', localAmountPaise: 10_000, cloudBookingReference: 'BH-101', cloudAmountPaise: 10_000 })).toBe('BOOKING_MISMATCH');
  });

  it('only marks an exact comparison as matched', () => {
    expect(reconcileOfflineBill({ localBookingReference: 'BH-100', localAmountPaise: 10_000, cloudBookingReference: 'BH-100', cloudAmountPaise: 10_000 })).toBe('MATCHED');
  });
});

describe('authorization and reservation dates', () => {
  it('keeps verification and financial access out of operational roles', () => {
    expect(roleCan('HOUSEKEEPING', 'folio.read')).toBe(false);
    expect(roleCan('RESTAURANT', 'offline.bill.verify')).toBe(false);
    expect(roleCan('ACCOUNTS', 'offline.bill.verify')).toBe(true);
  });

  it('requires departure after arrival', () => {
    expect(() => validateStayDates('2026-08-24', '2026-08-24')).toThrow('Departure must be after arrival');
    expect(() => validateStayDates('2026-08-24', '2026-08-25')).not.toThrow();
    expect(calculateStayNights('2026-08-24', '2026-08-27')).toBe(3);
  });

  it('segregates fixed hotel and travel roles while managers can switch', () => {
    expect(businessUnitsForRole('RECEPTION')).toEqual(['HOTEL']);
    expect(businessUnitsForRole('TRAVEL_AGENT')).toEqual(['TRAVEL']);
    expect(businessUnitsForRole('MANAGER')).toEqual(['HOTEL', 'TRAVEL']);
    expect(resolveBusinessUnit('TRAVEL_AGENT', 'HOTEL')).toBe('TRAVEL');
    expect(resolveBusinessUnit('RECEPTION', 'TRAVEL')).toBe('HOTEL');
  });

  it('keeps pricing approval and inventory writes with the intended roles', () => {
    expect(roleCan('TRAVEL_AGENT', 'travel.package.create')).toBe(true);
    expect(roleCan('TRAVEL_AGENT', 'travel.discount.approve')).toBe(false);
    expect(roleCan('MANAGER', 'travel.discount.approve')).toBe(true);
    expect(roleCan('TOUR_MANAGER', 'travel.pricing.manage')).toBe(true);
    expect(roleCan('HOUSEKEEPING', 'inventory.write')).toBe(false);
    expect(roleCan('HOUSEKEEPING', 'operations.write')).toBe(true);
    expect(roleCan('RESTAURANT', 'inventory.write')).toBe(true);
    expect(roleCan('RESTAURANT', 'restaurant.charge.post')).toBe(true);
    expect(roleCan('HOUSEKEEPING', 'restaurant.charge.post')).toBe(false);
    expect(roleCan('RECEPTION', 'offline.reservation.create')).toBe(true);
    expect(roleCan('HOUSEKEEPING', 'damage.review')).toBe(false);
    expect(roleCan('RECEPTION', 'damage.read')).toBe(true);
    expect(roleCan('RECEPTION', 'damage.review')).toBe(false);
    expect(roleCan('ACCOUNTS', 'damage.read')).toBe(true);
    expect(roleCan('MANAGER', 'damage.review')).toBe(true);
  });
});

describe('damage policy', () => {
  it('normalizes current severities and legacy inspection values', () => {
    expect(normalizeDamageSeverity('low')).toBe('LOW');
    expect(normalizeDamageSeverity('MEDIUM')).toBe('MEDIUM');
    expect(normalizeDamageSeverity('high')).toBe('HIGH');
    expect(normalizeDamageSeverity('MINOR')).toBe('LOW');
    expect(normalizeDamageSeverity('MAJOR')).toBe('HIGH');
    expect(normalizeDamageSeverity('critical')).toBeNull();
  });

  it('caps the recorded repair cost at the snapshotted policy liability', () => {
    expect(calculatePolicyDamageCharge(175_000, 250_000)).toBe(175_000);
    expect(calculatePolicyDamageCharge(900_000, 250_000)).toBe(250_000);
    expect(() => calculatePolicyDamageCharge(0, 250_000)).toThrow('Repair cost must be a positive');
    expect(() => calculatePolicyDamageCharge(100_000_001, 250_000)).toThrow('up to ₹10,00,000');
    expect(() => calculatePolicyDamageCharge(100_000, 0)).toThrow('no valid liability limit');
  });
});
