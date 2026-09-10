import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const organisations = pgTable('organisations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  active: boolean('active').notNull().default(true),
  updatedAt: text('updated_at'),
});

export const properties = pgTable('properties', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  timezone: text('timezone').notNull(),
  checkInTime: text('check_in_time').notNull().default('14:00'),
  checkOutTime: text('check_out_time').notNull().default('11:00'),
  kycRequired: boolean('kyc_required').notNull().default(true),
  active: boolean('active').notNull().default(true),
  updatedAt: text('updated_at'),
  connectionStatus: text('connection_status').notNull().default('ONLINE'),
  lastSyncAt: text('last_sync_at').notNull(),
  version: integer('version').notNull().default(1),
  legalName: text('legal_name'),
  billingAddress: text('billing_address'),
  billingState: text('billing_state'),
  billingStateCode: text('billing_state_code'),
  gstin: text('gstin'),
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  receiptPrefix: text('receipt_prefix').notNull().default('RCT'),
  defaultTaxRateBps: integer('default_tax_rate_bps').notNull().default(0),
  defaultTaxMode: text('default_tax_mode').notNull().default('CGST_SGST'),
}, (table) => [
  uniqueIndex('idx_properties_org_code').on(table.organisationId, table.code),
]);

export const appUsers = pgTable('app_users', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').references(() => properties.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  // Provisioned by a trusted administrator; never linked automatically by email.
  authProvider: text('auth_provider'),
  authSubject: text('auth_subject'),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  googleAvatarUrl: text('google_avatar_url'),
  customAvatarKey: text('custom_avatar_key'),
  updatedAt: text('updated_at'),
  role: text('role').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_users_auth_identity').on(table.authProvider, table.authSubject),
  uniqueIndex('idx_users_org_email').on(table.organisationId, table.email),
  index('idx_users_property_role').on(table.propertyId, table.role),
]);

export const userAuthIdentities = pgTable('user_auth_identities', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => appUsers.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerSubject: text('provider_subject').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  status: text('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
  uniqueIndex('idx_user_auth_identity_provider_subject').on(table.provider, table.providerSubject),
  index('idx_user_auth_identity_email').on(table.email),
]);

export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
  uniqueIndex('idx_user_sessions_token_hash').on(table.tokenHash),
  index('idx_user_sessions_user_expiry').on(table.userId, table.expiresAt),
]);

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  number: text('number').notNull(),
  floor: integer('floor').notNull(),
  roomType: text('room_type').notNull(),
  baseRatePaise: integer('base_rate_paise').notNull(),
  occupancyStatus: text('occupancy_status').notNull(),
  operationalStatus: text('operational_status').notNull(),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_rooms_property_number').on(table.propertyId, table.number),
  index('idx_rooms_property_status').on(table.propertyId, table.occupancyStatus, table.operationalStatus),
]);

export const guests = pgTable('guests', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  firstName: text('first_name'),
  lastName: text('last_name'),
  displayName: text('display_name'),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  alternatePhone: text('alternate_phone'),
  dateOfBirth: text('date_of_birth'),
  nationality: text('nationality'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  companyName: text('company_name'),
  gstin: text('gstin'),
  notes: text('notes'),
  preferences: text('preferences'),
  dietaryRequirements: text('dietary_requirements'),
  loyaltyTier: text('loyalty_tier'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_guests_property_name').on(table.propertyId, table.fullName),
  index('idx_guests_property_phone').on(table.propertyId, table.phone),
  index('idx_guests_org_email').on(table.organisationId, table.email),
]);

export const reservationGuests = pgTable('reservation_guests', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  guestId: text('guest_id').notNull().references(() => guests.id),
  guestRole: text('guest_role').notNull().default('ACCOMPANYING'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
  uniqueIndex('idx_reservation_guests_unique').on(table.reservationId, table.guestId),
  index('idx_reservation_guests_tenant').on(table.organisationId, table.propertyId, table.reservationId),
]);

export const guestIdentityDocuments = pgTable('guest_identity_documents', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  guestId: text('guest_id').notNull().references(() => guests.id),
  documentType: text('document_type').notNull(),
  maskedNumber: text('masked_number').notNull(),
  issuingCountry: text('issuing_country'),
  issuedAt: text('issued_at'),
  expiresAt: text('expires_at'),
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }),
  verifiedBy: text('verified_by').references(() => appUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [index('idx_guest_identity_tenant_guest').on(table.organisationId, table.propertyId, table.guestId)]);

export const reservations = pgTable('reservations', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reference: text('reference').notNull(),
  guestId: text('guest_id').notNull().references(() => guests.id),
  roomId: text('room_id').references(() => rooms.id),
  roomType: text('room_type').notNull(),
  primaryGuestName: text('primary_guest_name').notNull(),
  arrivalDate: text('arrival_date').notNull(),
  departureDate: text('departure_date').notNull(),
  status: text('status').notNull(),
  source: text('source').notNull(),
  sourceReference: text('source_reference'),
  adults: integer('adults').notNull().default(1),
  children: integer('children').notNull().default(0),
  nightlyRatePaise: integer('nightly_rate_paise').notNull().default(0),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  estimatedTotalPaise: integer('estimated_total_paise').notNull().default(0),
  specialRequests: text('special_requests'),
  internalNotes: text('internal_notes'),
  holdUntil: timestamp('hold_until', { withTimezone: true, mode: 'string' }),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
  cancelledBy: text('cancelled_by').references(() => appUsers.id),
  noShowAt: timestamp('no_show_at', { withTimezone: true, mode: 'string' }),
  noShowBy: text('no_show_by').references(() => appUsers.id),
  createdBy: text('created_by').notNull().references(() => appUsers.id),
  updatedBy: text('updated_by').notNull().references(() => appUsers.id),
  totalAmountPaise: integer('total_amount_paise').notNull(),
  balancePaise: integer('balance_paise').notNull(),
  createdWhilePropertyOffline: boolean('created_while_property_offline').notNull().default(false),
  contactStatus: text('contact_status').notNull().default('NOT_CONTACTED'),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_reservations_property_reference').on(table.propertyId, table.reference),
  index('idx_reservations_property_dates').on(table.propertyId, table.arrivalDate, table.departureDate),
  index('idx_reservations_property_status').on(table.propertyId, table.status),
  index('idx_reservations_guest').on(table.guestId),
]);

export const reservationSequences = pgTable('reservation_sequences', {
  propertyId: text('property_id').primaryKey().references(() => properties.id),
  nextValue: integer('next_value').notNull().default(1),
});

export const stays = pgTable('stays', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  guestId: text('guest_id').notNull().references(() => guests.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  status: text('status').notNull().default('IN_HOUSE'),
  plannedCheckInAt: timestamp('planned_check_in_at', { withTimezone: true, mode: 'string' }).notNull(),
  plannedCheckOutAt: timestamp('planned_check_out_at', { withTimezone: true, mode: 'string' }).notNull(),
  actualCheckInAt: timestamp('actual_check_in_at', { withTimezone: true, mode: 'string' }).notNull(),
  actualCheckOutAt: timestamp('actual_check_out_at', { withTimezone: true, mode: 'string' }),
  checkedInBy: text('checked_in_by').notNull().references(() => appUsers.id),
  checkedOutBy: text('checked_out_by').references(() => appUsers.id),
  earlyCheckIn: boolean('early_check_in').notNull().default(false),
  earlyCheckInOverride: boolean('early_check_in_override').notNull().default(false),
  notes: text('notes'),
  lateCheckoutStatus: text('late_checkout_status'),
  lateCheckoutRequestedUntil: timestamp('late_checkout_requested_until', { withTimezone: true, mode: 'string' }),
  lateCheckoutRequestedAt: timestamp('late_checkout_requested_at', { withTimezone: true, mode: 'string' }),
  lateCheckoutRequestedBy: text('late_checkout_requested_by').references(() => appUsers.id),
  lateCheckoutDecidedAt: timestamp('late_checkout_decided_at', { withTimezone: true, mode: 'string' }),
  lateCheckoutDecidedBy: text('late_checkout_decided_by').references(() => appUsers.id),
  lateCheckoutDecisionNote: text('late_checkout_decision_note'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
  uniqueIndex('idx_stays_reservation').on(table.reservationId),
  index('idx_stays_tenant_status').on(table.organisationId, table.propertyId, table.status),
]);

export const stayKeyIssues = pgTable('stay_key_issues', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  stayId: text('stay_id').notNull().references(() => stays.id),
  keyType: text('key_type').notNull().default('CARD'),
  keyLabel: text('key_label').notNull(),
  quantity: integer('quantity').notNull().default(1),
  status: text('status').notNull().default('ISSUED'),
  issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).notNull(),
  issuedBy: text('issued_by').notNull().references(() => appUsers.id),
  returnedAt: timestamp('returned_at', { withTimezone: true, mode: 'string' }),
  notes: text('notes'),
}, (table) => [index('idx_stay_keys_tenant_stay').on(table.organisationId, table.propertyId, table.stayId)]);

export const reservationEvents = pgTable('reservation_events', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  eventType: text('event_type').notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status'),
  performedBy: text('performed_by').notNull().references(() => appUsers.id),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
  index('idx_reservation_events_tenant_reservation_time').on(table.organisationId, table.propertyId, table.reservationId, table.createdAt),
]);

export const folios = pgTable('folios', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  guestId: text('guest_id').references(() => guests.id),
  stayId: text('stay_id').references(() => stays.id),
  status: text('status').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(),
  taxPaise: integer('tax_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  discountPaise: integer('discount_paise').notNull().default(0),
  taxableAmountPaise: integer('taxable_amount_paise').notNull().default(0),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  igstPaise: integer('igst_paise').notNull().default(0),
  paidPaise: integer('paid_paise').notNull().default(0),
  refundedPaise: integer('refunded_paise').notNull().default(0),
  outstandingPaise: integer('outstanding_paise').notNull().default(0),
  closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
  closedBy: text('closed_by').references(() => appUsers.id),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_folios_reservation').on(table.reservationId),
  index('idx_folios_property_status').on(table.propertyId, table.status),
]);

export const folioLines = pgTable('folio_lines', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  folioId: text('folio_id').notNull().references(() => folios.id),
  description: text('description').notNull(),
  category: text('category').notNull(),
  quantity: integer('quantity').notNull(),
  unitAmountPaise: integer('unit_amount_paise').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull(),
  lineTotalPaise: integer('line_total_paise').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull().default(0),
  discountPaise: integer('discount_paise').notNull().default(0),
  taxableAmountPaise: integer('taxable_amount_paise').notNull().default(0),
  taxPaise: integer('tax_paise').notNull().default(0),
  cgstPaise: integer('cgst_paise').notNull().default(0),
  sgstPaise: integer('sgst_paise').notNull().default(0),
  igstPaise: integer('igst_paise').notNull().default(0),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  serviceDate: text('service_date'),
  postedBy: text('posted_by').references(() => appUsers.id),
  voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'string' }),
  voidedBy: text('voided_by').references(() => appUsers.id),
  voidReason: text('void_reason'),
  source: text('source').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_folio_lines_folio').on(table.folioId)]);

export const financialSequences = pgTable('financial_sequences', {
  propertyId: text('property_id').notNull().references(() => properties.id),
  financialYear: text('financial_year').notNull(),
  sequenceType: text('sequence_type').notNull(),
  nextValue: integer('next_value').notNull().default(1),
}, (table) => [primaryKey({ columns: [table.propertyId, table.financialYear, table.sequenceType] })]);

export const payments = pgTable('payments', {
  id: text('id').primaryKey(), organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id), folioId: text('folio_id').notNull().references(() => folios.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id), paymentNumber: text('payment_number').notNull(),
  method: text('method').notNull(), amountPaise: integer('amount_paise').notNull(), reference: text('reference'), notes: text('notes'),
  status: text('status').notNull().default('RECEIVED'), idempotencyKey: text('idempotency_key').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'string' }).notNull(), receivedBy: text('received_by').notNull().references(() => appUsers.id),
  reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'string' }), reversedBy: text('reversed_by').references(() => appUsers.id),
  reversalReason: text('reversal_reason'), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [uniqueIndex('idx_payments_property_number').on(table.propertyId, table.paymentNumber), uniqueIndex('idx_payments_folio_idempotency').on(table.folioId, table.idempotencyKey), index('idx_payments_folio_status').on(table.folioId, table.status)]);

export const paymentRefunds = pgTable('payment_refunds', {
  id: text('id').primaryKey(), organisationId: text('organisation_id').notNull().references(() => organisations.id),
  propertyId: text('property_id').notNull().references(() => properties.id), folioId: text('folio_id').notNull().references(() => folios.id),
  paymentId: text('payment_id').notNull().references(() => payments.id), amountPaise: integer('amount_paise').notNull(), reason: text('reason').notNull(),
  reference: text('reference'), status: text('status').notNull().default('RECORDED'), idempotencyKey: text('idempotency_key').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' }).notNull(), processedBy: text('processed_by').notNull().references(() => appUsers.id),
}, (table) => [uniqueIndex('idx_refunds_payment_idempotency').on(table.paymentId, table.idempotencyKey), index('idx_refunds_folio').on(table.folioId)]);

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(), organisationId: text('organisation_id').notNull().references(() => organisations.id), propertyId: text('property_id').notNull().references(() => properties.id),
  folioId: text('folio_id').notNull().references(() => folios.id), reservationId: text('reservation_id').notNull().references(() => reservations.id), guestId: text('guest_id').notNull().references(() => guests.id),
  invoiceNumber: text('invoice_number').notNull(), financialYear: text('financial_year').notNull(), invoiceDate: text('invoice_date').notNull(),
  customerNameSnapshot: text('customer_name_snapshot').notNull(), customerCompanySnapshot: text('customer_company_snapshot'), customerGstinSnapshot: text('customer_gstin_snapshot'), billingAddressSnapshot: text('billing_address_snapshot'), customerStateSnapshot: text('customer_state_snapshot'),
  propertyLegalNameSnapshot: text('property_legal_name_snapshot').notNull(), propertyGstinSnapshot: text('property_gstin_snapshot'), propertyAddressSnapshot: text('property_address_snapshot'),
  subtotalPaise: integer('subtotal_paise').notNull(), discountPaise: integer('discount_paise').notNull(), taxableAmountPaise: integer('taxable_amount_paise').notNull(), cgstPaise: integer('cgst_paise').notNull(), sgstPaise: integer('sgst_paise').notNull(), igstPaise: integer('igst_paise').notNull(), grandTotalPaise: integer('grand_total_paise').notNull(),
  status: text('status').notNull().default('ISSUED'), issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).notNull(), issuedBy: text('issued_by').notNull().references(() => appUsers.id),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }), cancelledBy: text('cancelled_by').references(() => appUsers.id), cancelReason: text('cancel_reason'), createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [uniqueIndex('idx_invoices_property_number').on(table.propertyId, table.invoiceNumber), uniqueIndex('idx_invoices_folio_issued').on(table.folioId).where(sql`${table.status} = 'ISSUED'`)]);

export const offlineBills = pgTable('offline_bills', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  offlineReference: text('offline_reference').notNull(),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  bookingReference: text('booking_reference').notNull(),
  guestId: text('guest_id').notNull().references(() => guests.id),
  deviceId: text('device_id').notNull(),
  generatedBy: text('generated_by').notNull(),
  localAmountPaise: integer('local_amount_paise').notNull(),
  taxPaise: integer('tax_paise').notNull(),
  cloudAmountPaise: integer('cloud_amount_paise'),
  currency: text('currency').notNull().default('INR'),
  status: text('status').notNull(),
  documentHash: text('document_hash').notNull(),
  notes: text('notes'),
  generatedAt: text('generated_at').notNull(),
  verifiedAt: text('verified_at'),
  verifiedBy: text('verified_by'),
}, (table) => [
  uniqueIndex('idx_offline_bills_property_reference').on(table.propertyId, table.offlineReference),
  index('idx_offline_bills_reservation_status').on(table.reservationId, table.status),
]);

export const housekeepingTasks = pgTable('housekeeping_tasks', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  reservationId: text('reservation_id').references(() => reservations.id),
  assignedTo: text('assigned_to'),
  taskType: text('task_type').notNull().default('STAY_SERVICE'),
  priority: text('priority').notNull(),
  status: text('status').notNull(),
  outcome: text('outcome'),
  scheduledAt: text('scheduled_at').notNull(),
  deferredUntil: text('deferred_until'),
  completedAt: text('completed_at'),
  updatedAt: text('updated_at').notNull().default(''),
  version: integer('version').notNull().default(1),
  notes: text('notes'),
}, (table) => [
  index('idx_housekeeping_property_status').on(table.propertyId, table.status),
  index('idx_housekeeping_reservation_type').on(table.reservationId, table.taskType),
  uniqueIndex('idx_housekeeping_unique_checkout_inspection').on(table.reservationId, table.taskType).where(sql`${table.taskType} = 'CHECKOUT_INSPECTION'`),
]);

export const roomInspections = pgTable('room_inspections', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  taskId: text('task_id').notNull().references(() => housekeepingTasks.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  result: text('result').notNull(),
  notes: text('notes'),
  damageSeverity: text('damage_severity'),
  completedBy: text('completed_by').notNull(),
  completedAt: text('completed_at').notNull(),
}, (table) => [
  uniqueIndex('idx_room_inspections_task').on(table.taskId),
  index('idx_room_inspections_reservation').on(table.reservationId, table.completedAt),
]);

export const damagePolicyRules = pgTable('damage_policy_rules', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  severity: text('severity').notNull(),
  label: text('label').notNull(),
  liabilityCapPaise: integer('liability_cap_paise').notNull(),
  roomImpact: text('room_impact').notNull(),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_damage_policy_property_severity_active').on(table.propertyId, table.severity).where(sql`${table.active} = true`),
]);

export const damageReports = pgTable('damage_reports', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  inspectionId: text('inspection_id').notNull().references(() => roomInspections.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  folioId: text('folio_id').notNull().references(() => folios.id),
  description: text('description').notNull(),
  severity: text('severity').notNull(),
  status: text('status').notNull(),
  policyRuleId: text('policy_rule_id').references(() => damagePolicyRules.id),
  policyLabel: text('policy_label'),
  policyLiabilityPaise: integer('policy_liability_paise'),
  repairCostPaise: integer('repair_cost_paise'),
  chargeAmountPaise: integer('charge_amount_paise'),
  folioLineId: text('folio_line_id'),
  decisionNote: text('decision_note'),
  reportedBy: text('reported_by').notNull(),
  reportedAt: text('reported_at').notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  version: integer('version').notNull().default(1),
}, (table) => [
  uniqueIndex('idx_damage_reports_inspection').on(table.inspectionId),
  index('idx_damage_reports_property_status').on(table.propertyId, table.status, table.reportedAt),
]);

export const maintenanceTickets = pgTable('maintenance_tickets', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  roomId: text('room_id').references(() => rooms.id),
  category: text('category').notNull(),
  issue: text('issue').notNull(),
  severity: text('severity').notNull(),
  assignedTo: text('assigned_to'),
  status: text('status').notNull(),
  openedAt: text('opened_at').notNull(),
}, (table) => [index('idx_maintenance_property_status').on(table.propertyId, table.status)]);

export const inventoryItems = pgTable('inventory_items', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  name: text('name').notNull(),
  category: text('category').notNull(),
  department: text('department').notNull().default('HOTEL'),
  unit: text('unit').notNull(),
  currentQuantity: integer('current_quantity').notNull(),
  minimumQuantity: integer('minimum_quantity').notNull(),
  unitCostPaise: integer('unit_cost_paise').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_inventory_property_category').on(table.propertyId, table.category)]);

export const restaurantOrders = pgTable('restaurant_orders', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reservationId: text('reservation_id').references(() => reservations.id),
  roomNumber: text('room_number'),
  orderType: text('order_type').notNull(),
  status: text('status').notNull(),
  totalPaise: integer('total_paise').notNull(),
  paymentStatus: text('payment_status').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_restaurant_property_status').on(table.propertyId, table.status)]);

export const restaurantMealBookings = pgTable('restaurant_meal_bookings', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  reservationId: text('reservation_id').notNull().references(() => reservations.id),
  serviceDate: text('service_date').notNull(),
  mealPeriod: text('meal_period').notNull(),
  guestCount: integer('guest_count').notNull().default(1),
  status: text('status').notNull().default('BOOKED'),
  dietaryNotes: text('dietary_notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_restaurant_meal_reservation_date_period').on(table.reservationId, table.serviceDate, table.mealPeriod),
  index('idx_restaurant_meal_property_date_period').on(table.propertyId, table.serviceDate, table.mealPeriod),
]);

export const travelPackages = pgTable('travel_packages', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  name: text('name').notNull(),
  durationDays: integer('duration_days').notNull(),
  locations: text('locations').notNull(),
  capacity: integer('capacity').notNull(),
  booked: integer('booked').notNull(),
  sellingPricePaise: integer('selling_price_paise').notNull(),
  status: text('status').notNull(),
}, (table) => [index('idx_packages_org_status').on(table.organisationId, table.status)]);

export const travelAssets = pgTable('travel_assets', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  pricingUnit: text('pricing_unit').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  active: boolean('active').notNull().default(true),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_travel_assets_org_active').on(table.organisationId, table.active, table.category)]);

export const customTravelPackages = pgTable('custom_travel_packages', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  reference: text('reference').notNull(),
  clientName: text('client_name').notNull(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  ownerName: text('owner_name').notNull(),
  assetSubtotalPaise: integer('asset_subtotal_paise').notNull(),
  basePricePaise: integer('base_price_paise').notNull(),
  floorPricePaise: integer('floor_price_paise').notNull(),
  quotedPricePaise: integer('quoted_price_paise').notNull(),
  status: text('status').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_custom_packages_org_reference').on(table.organisationId, table.reference),
  index('idx_custom_packages_org_status').on(table.organisationId, table.status, table.updatedAt),
]);

export const customTravelPackageItems = pgTable('custom_travel_package_items', {
  id: text('id').primaryKey(),
  packageId: text('package_id').notNull().references(() => customTravelPackages.id),
  assetId: text('asset_id').notNull().references(() => travelAssets.id),
  assetName: text('asset_name').notNull(),
  category: text('category').notNull(),
  pricingUnit: text('pricing_unit').notNull(),
  quantity: integer('quantity').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  lineTotalPaise: integer('line_total_paise').notNull(),
}, (table) => [index('idx_custom_package_items_package').on(table.packageId)]);

export const travelDiscountRequests = pgTable('travel_discount_requests', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  packageId: text('package_id').notNull().references(() => customTravelPackages.id),
  packageVersion: integer('package_version').notNull(),
  requestedById: text('requested_by_id').notNull(),
  requestedByName: text('requested_by_name').notNull(),
  requestedPricePaise: integer('requested_price_paise').notNull(),
  basePricePaise: integer('base_price_paise').notNull(),
  floorPricePaise: integer('floor_price_paise').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  reviewedById: text('reviewed_by_id'),
  reviewedByName: text('reviewed_by_name'),
  decisionNote: text('decision_note'),
  createdAt: text('created_at').notNull(),
  decidedAt: text('decided_at'),
}, (table) => [
  index('idx_discount_requests_org_status').on(table.organisationId, table.status, table.createdAt),
  index('idx_discount_requests_package_version').on(table.packageId, table.packageVersion),
]);

export const inquiries = pgTable('inquiries', {
  id: text('id').primaryKey(),
  organisationId: text('organisation_id').notNull().references(() => organisations.id),
  reference: text('reference').notNull(),
  customerName: text('customer_name').notNull(),
  source: text('source').notNull(),
  owner: text('owner').notNull(),
  service: text('service').notNull(),
  estimatedValuePaise: integer('estimated_value_paise').notNull(),
  status: text('status').notNull(),
  followUpAt: text('follow_up_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_inquiries_org_reference').on(table.organisationId, table.reference),
  index('idx_inquiries_org_status').on(table.organisationId, table.status),
]);

export const integrationEvents = pgTable('integration_events', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').references(() => properties.id),
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull(),
  providerReference: text('provider_reference'),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_integration_events_provider_status').on(table.provider, table.status),
  uniqueIndex('idx_integration_provider_reference').on(table.provider, table.providerReference),
]);

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  role: text('role').notNull(),
  propertyId: text('property_id'),
  deviceId: text('device_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  previousValue: text('previous_value'),
  newValue: text('new_value'),
  source: text('source').notNull(),
  correlationId: text('correlation_id').notNull(),
}, (table) => [
  index('idx_audit_property_time').on(table.propertyId, table.timestamp),
  index('idx_audit_entity').on(table.entity, table.entityId),
]);
