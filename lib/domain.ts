export const DEMO_DATE = '2026-08-24';
// Demo/UAT identifiers only. Production callers must use authenticated AppActor context.
export const DEMO_PROPERTY_ID = 'prop-meridian-grand';
export const DEMO_ORGANISATION_ID = 'org-brainadz-hospitality-demo';
// Compatibility aliases for existing demo modules; never production defaults.
export const PROPERTY_ID = DEMO_PROPERTY_ID;
export const ORGANISATION_ID = DEMO_ORGANISATION_ID;
export const DEVICE_ID = 'BHZ-FD01';

export type AppRole =
  | 'OWNER'
  | 'MANAGER'
  | 'RECEPTION'
  | 'TRAVEL_AGENT'
  | 'TOUR_MANAGER'
  | 'ACCOUNTS'
  | 'HOUSEKEEPING'
  | 'RESTAURANT'
  | 'REPORTING';

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && Object.hasOwn(rolePermissions, value);
}

export type BusinessUnit = 'HOTEL' | 'TRAVEL';

export function businessUnitsForRole(role: AppRole): readonly BusinessUnit[] {
  if (role === 'OWNER' || role === 'MANAGER') return ['HOTEL', 'TRAVEL'];
  if (role === 'TRAVEL_AGENT' || role === 'TOUR_MANAGER') return ['TRAVEL'];
  return ['HOTEL'];
}

export function resolveBusinessUnit(role: AppRole, requested?: string | null): BusinessUnit {
  const allowed = businessUnitsForRole(role);
  const normalized = requested === 'TRAVEL' ? 'TRAVEL' : 'HOTEL';
  return allowed.includes(normalized) ? normalized : allowed[0];
}

export type Permission =
  | 'dashboard.read'
  | 'reservation.read'
  | 'reservation.write'
  | 'reservation.override'
  | 'guest.read'
  | 'guest.view'
  | 'guest.create'
  | 'guest.edit'
  | 'guest.kyc.view'
  | 'guest.kyc.verify'
  | 'frontdesk.view'
  | 'frontdesk.assign_room'
  | 'frontdesk.checkin'
  | 'frontdesk.room_move'
  | 'frontdesk.override'
  | 'frontdesk.late_checkout'
  | 'folio.read'
  | 'folio.write'
  | 'offline.cached.read'
  | 'offline.bill.create'
  | 'offline.bill.print'
  | 'offline.bill.verify'
  | 'offline.reservation.create'
  | 'network.simulate'
  | 'operations.write'
  | 'inventory.write'
  | 'restaurant.charge.post'
  | 'damage.read'
  | 'damage.review'
  | 'travel.read'
  | 'travel.package.create'
  | 'travel.pricing.manage'
  | 'travel.discount.request'
  | 'travel.discount.approve'
  | 'reports.read';

const rolePermissions: Record<AppRole, readonly Permission[]> = {
  OWNER: ['dashboard.read', 'reservation.read', 'reservation.write', 'reservation.override', 'guest.read', 'guest.view', 'guest.create', 'guest.edit', 'guest.kyc.view', 'guest.kyc.verify', 'frontdesk.view', 'frontdesk.assign_room', 'frontdesk.checkin', 'frontdesk.room_move', 'frontdesk.override', 'frontdesk.late_checkout', 'folio.read', 'folio.write', 'offline.cached.read', 'offline.bill.create', 'offline.bill.print', 'offline.bill.verify', 'offline.reservation.create', 'network.simulate', 'operations.write', 'inventory.write', 'restaurant.charge.post', 'damage.read', 'damage.review', 'travel.read', 'travel.package.create', 'travel.pricing.manage', 'travel.discount.request', 'travel.discount.approve', 'reports.read'],
  MANAGER: ['dashboard.read', 'reservation.read', 'reservation.write', 'reservation.override', 'guest.read', 'guest.view', 'guest.create', 'guest.edit', 'guest.kyc.view', 'guest.kyc.verify', 'frontdesk.view', 'frontdesk.assign_room', 'frontdesk.checkin', 'frontdesk.room_move', 'frontdesk.override', 'frontdesk.late_checkout', 'folio.read', 'folio.write', 'offline.cached.read', 'offline.bill.create', 'offline.bill.print', 'offline.bill.verify', 'offline.reservation.create', 'network.simulate', 'operations.write', 'inventory.write', 'restaurant.charge.post', 'damage.read', 'damage.review', 'travel.read', 'travel.package.create', 'travel.pricing.manage', 'travel.discount.request', 'travel.discount.approve', 'reports.read'],
  RECEPTION: ['dashboard.read', 'reservation.read', 'reservation.write', 'guest.read', 'guest.view', 'guest.create', 'guest.edit', 'guest.kyc.view', 'guest.kyc.verify', 'frontdesk.view', 'frontdesk.assign_room', 'frontdesk.checkin', 'frontdesk.room_move', 'frontdesk.late_checkout', 'folio.read', 'folio.write', 'offline.cached.read', 'offline.bill.create', 'offline.bill.print', 'offline.reservation.create', 'restaurant.charge.post', 'damage.read'],
  TRAVEL_AGENT: ['dashboard.read', 'travel.read', 'travel.package.create', 'travel.discount.request'],
  TOUR_MANAGER: ['dashboard.read', 'travel.read', 'travel.package.create', 'travel.pricing.manage', 'travel.discount.request', 'travel.discount.approve'],
  ACCOUNTS: ['dashboard.read', 'reservation.read', 'guest.read', 'folio.read', 'folio.write', 'offline.bill.verify', 'damage.read', 'reports.read'],
  HOUSEKEEPING: ['dashboard.read', 'operations.write'],
  RESTAURANT: ['dashboard.read', 'operations.write', 'inventory.write', 'restaurant.charge.post'],
  REPORTING: ['dashboard.read', 'frontdesk.view', 'reports.read'],
};

export function roleCan(role: AppRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function assertRoleCan(role: AppRole, permission: Permission): void {
  if (!roleCan(role, permission)) {
    throw new DomainError('FORBIDDEN', `${role.replaceAll('_', ' ')} does not have ${permission}.`, 403);
  }
}

export const offlineAllowedCapabilities = [
  'offline.cached.read',
  'offline.bill.create',
  'offline.bill.print',
  'offline.reservation.create',
] as const;

export function assertPropertyMutationAllowed(propertyOnline: boolean, surface: 'MASTER_HUB' | 'PROPERTY'): void {
  if (!propertyOnline && surface === 'PROPERTY') {
    throw new DomainError(
      'MASTER_HUB_REQUIRED',
      'This change requires a connection to Master Hub.',
      409,
    );
  }
}

export type DamageSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export function normalizeDamageSeverity(value: unknown): DamageSeverity | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'MINOR') return 'LOW';
  if (normalized === 'MAJOR') return 'HIGH';
  return normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH' ? normalized : null;
}

export function calculatePolicyDamageCharge(repairCostPaise: number, policyLiabilityPaise: number): number {
  if (!Number.isSafeInteger(repairCostPaise) || repairCostPaise <= 0 || repairCostPaise > 100_000_000) {
    throw new DomainError('INVALID_REPAIR_COST', 'Repair cost must be a positive whole amount up to ₹10,00,000.', 400);
  }
  if (!Number.isSafeInteger(policyLiabilityPaise) || policyLiabilityPaise <= 0) {
    throw new DomainError('INVALID_DAMAGE_POLICY', 'The property damage policy has no valid liability limit.', 409);
  }
  return Math.min(repairCostPaise, policyLiabilityPaise);
}

export function calculateBill(subtotalPaise: number, taxRateBps: number) {
  if (!Number.isInteger(subtotalPaise) || subtotalPaise < 0) {
    throw new DomainError('INVALID_AMOUNT', 'Subtotal must be a non-negative integer amount in paise.', 400);
  }
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    throw new DomainError('INVALID_TAX', 'Tax rate must be between 0 and 10000 basis points.', 400);
  }
  const taxPaise = Math.round((subtotalPaise * taxRateBps) / 10_000);
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

export type ReconciliationStatus =
  | 'MATCHED'
  | 'VERIFIED'
  | 'MASTER_RECORD_NOT_FOUND'
  | 'AMOUNT_MISMATCH'
  | 'BOOKING_MISMATCH'
  | 'REVIEW_REQUIRED';

export function reconcileOfflineBill(input: {
  localBookingReference: string;
  localAmountPaise: number;
  cloudBookingReference?: string | null;
  cloudAmountPaise?: number | null;
  candidateCount?: number;
}): ReconciliationStatus {
  if (!input.cloudBookingReference || input.cloudAmountPaise == null) return 'MASTER_RECORD_NOT_FOUND';
  if (input.candidateCount && input.candidateCount > 1) return 'REVIEW_REQUIRED';
  if (input.cloudBookingReference !== input.localBookingReference) return 'BOOKING_MISMATCH';
  if (input.cloudAmountPaise !== input.localAmountPaise) return 'AMOUNT_MISMATCH';
  return 'MATCHED';
}

export function validateStayDates(arrivalDate: string, departureDate: string): void {
  const arrival = Date.parse(`${arrivalDate}T00:00:00Z`);
  const departure = Date.parse(`${departureDate}T00:00:00Z`);
  if (!Number.isFinite(arrival) || !Number.isFinite(departure) || departure <= arrival) {
    throw new DomainError('INVALID_STAY_DATES', 'Departure must be after arrival.', 400);
  }
}

export function calculateStayNights(arrivalDate: string, departureDate: string): number {
  validateStayDates(arrivalDate, departureDate);
  return Math.round((Date.parse(`${departureDate}T00:00:00Z`) - Date.parse(`${arrivalDate}T00:00:00Z`)) / 86_400_000);
}

export function createOfflineReference(sequence: number, date = DEMO_DATE): string {
  const compactDate = date.replaceAll('-', '');
  return `BHZ-FD01-${compactDate}-${String(sequence).padStart(4, '0')}`;
}

export function createOfflineReservationReference(sequence: number | string, date = DEMO_DATE): string {
  const compactDate = date.replaceAll('-', '');
  const suffix = typeof sequence === 'number'
    ? String(sequence).padStart(4, '0')
    : sequence.replaceAll(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 12);
  return `BHZ-WALKIN-${compactDate}-${suffix}`;
}

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
