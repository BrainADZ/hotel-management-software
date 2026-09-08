import { assertDemoMode, demoFeatureEnabled } from './app-mode';
import { demoActorFromRequest } from './auth/demo';
import { env } from 'cloudflare:workers';
import {
  DEMO_DATE,
  DomainError,
  ORGANISATION_ID,
  PROPERTY_ID,
  assertPropertyMutationAllowed,
  assertRoleCan,
  calculatePolicyDamageCharge,
  calculateStayNights,
  normalizeDamageSeverity,
  reconcileOfflineBill,
  roleCan,
  validateStayDates,
  type AppRole,
  type BusinessUnit,
  type DamageSeverity,
  type Permission,
} from '@/lib/domain';

const DEMO_TIMESTAMP = '2026-08-24T13:58:00.000Z';

export type Actor = { id: string; name: string; email: string; role: AppRole };
type D1 = D1Database;
let initialization: Promise<void> | undefined;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS organisations (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS properties (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, city TEXT NOT NULL, timezone TEXT NOT NULL, connection_status TEXT NOT NULL DEFAULT 'ONLINE', last_sync_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, FOREIGN KEY (organisation_id) REFERENCES organisations(id))`,
  `CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, property_id TEXT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, number TEXT NOT NULL, floor INTEGER NOT NULL, room_type TEXT NOT NULL, base_rate_paise INTEGER NOT NULL, occupancy_status TEXT NOT NULL, operational_status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT, phone TEXT, city TEXT, preferences TEXT, dietary_requirements TEXT, loyalty_tier TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, reference TEXT NOT NULL, guest_id TEXT NOT NULL, room_id TEXT, room_type TEXT NOT NULL, arrival_date TEXT NOT NULL, departure_date TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL, total_amount_paise INTEGER NOT NULL, balance_paise INTEGER NOT NULL, created_while_property_offline INTEGER NOT NULL DEFAULT 0, contact_status TEXT NOT NULL DEFAULT 'NOT_CONTACTED', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS folios (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, reservation_id TEXT NOT NULL, status TEXT NOT NULL, subtotal_paise INTEGER NOT NULL, tax_paise INTEGER NOT NULL, total_paise INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS folio_lines (id TEXT PRIMARY KEY, folio_id TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, quantity INTEGER NOT NULL, unit_amount_paise INTEGER NOT NULL, tax_rate_bps INTEGER NOT NULL, line_total_paise INTEGER NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS offline_bills (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, offline_reference TEXT NOT NULL, reservation_id TEXT NOT NULL, booking_reference TEXT NOT NULL, guest_id TEXT NOT NULL, device_id TEXT NOT NULL, generated_by TEXT NOT NULL, local_amount_paise INTEGER NOT NULL, tax_paise INTEGER NOT NULL, cloud_amount_paise INTEGER, currency TEXT NOT NULL DEFAULT 'INR', status TEXT NOT NULL, document_hash TEXT NOT NULL, notes TEXT, generated_at TEXT NOT NULL, verified_at TEXT, verified_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS housekeeping_tasks (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, room_id TEXT NOT NULL, reservation_id TEXT, assigned_to TEXT, task_type TEXT NOT NULL DEFAULT 'STAY_SERVICE', priority TEXT NOT NULL, status TEXT NOT NULL, outcome TEXT, scheduled_at TEXT NOT NULL, deferred_until TEXT, completed_at TEXT, updated_at TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS room_inspections (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, task_id TEXT NOT NULL, reservation_id TEXT NOT NULL, room_id TEXT NOT NULL, result TEXT NOT NULL, notes TEXT, damage_severity TEXT, completed_by TEXT NOT NULL, completed_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS damage_policy_rules (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, severity TEXT NOT NULL, label TEXT NOT NULL, liability_cap_paise INTEGER NOT NULL, room_impact TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS damage_reports (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, inspection_id TEXT NOT NULL, reservation_id TEXT NOT NULL, room_id TEXT NOT NULL, folio_id TEXT NOT NULL, description TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, policy_rule_id TEXT, policy_label TEXT, policy_liability_paise INTEGER, repair_cost_paise INTEGER, charge_amount_paise INTEGER, folio_line_id TEXT, decision_note TEXT, reported_by TEXT NOT NULL, reported_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, version INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS maintenance_tickets (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, room_id TEXT, category TEXT NOT NULL, issue TEXT NOT NULL, severity TEXT NOT NULL, assigned_to TEXT, status TEXT NOT NULL, opened_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inventory_items (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, department TEXT NOT NULL DEFAULT 'HOTEL', unit TEXT NOT NULL, current_quantity INTEGER NOT NULL, minimum_quantity INTEGER NOT NULL, unit_cost_paise INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS restaurant_orders (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, reservation_id TEXT, room_number TEXT, order_type TEXT NOT NULL, status TEXT NOT NULL, total_paise INTEGER NOT NULL, payment_status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS restaurant_meal_bookings (id TEXT PRIMARY KEY, property_id TEXT NOT NULL, reservation_id TEXT NOT NULL, service_date TEXT NOT NULL, meal_period TEXT NOT NULL, guest_count INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'BOOKED', dietary_notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS travel_packages (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, name TEXT NOT NULL, duration_days INTEGER NOT NULL, locations TEXT NOT NULL, capacity INTEGER NOT NULL, booked INTEGER NOT NULL, selling_price_paise INTEGER NOT NULL, status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS travel_assets (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, pricing_unit TEXT NOT NULL, unit_price_paise INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS custom_travel_packages (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, reference TEXT NOT NULL, client_name TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, owner_name TEXT NOT NULL, asset_subtotal_paise INTEGER NOT NULL, base_price_paise INTEGER NOT NULL, floor_price_paise INTEGER NOT NULL, quoted_price_paise INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS custom_travel_package_items (id TEXT PRIMARY KEY, package_id TEXT NOT NULL, asset_id TEXT NOT NULL, asset_name TEXT NOT NULL, category TEXT NOT NULL, pricing_unit TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price_paise INTEGER NOT NULL, line_total_paise INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS travel_discount_requests (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, package_id TEXT NOT NULL, package_version INTEGER NOT NULL, requested_by_id TEXT NOT NULL, requested_by_name TEXT NOT NULL, requested_price_paise INTEGER NOT NULL, base_price_paise INTEGER NOT NULL, floor_price_paise INTEGER NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, reviewed_by_id TEXT, reviewed_by_name TEXT, decision_note TEXT, created_at TEXT NOT NULL, decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, reference TEXT NOT NULL, customer_name TEXT NOT NULL, source TEXT NOT NULL, owner TEXT NOT NULL, service TEXT NOT NULL, estimated_value_paise INTEGER NOT NULL, status TEXT NOT NULL, follow_up_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS integration_events (id TEXT PRIMARY KEY, property_id TEXT, provider TEXT NOT NULL, event_type TEXT NOT NULL, status TEXT NOT NULL, provider_reference TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, role TEXT NOT NULL, property_id TEXT, device_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, previous_value TEXT, new_value TEXT, source TEXT NOT NULL, correlation_id TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_org_code ON properties(organisation_id, code)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_property_number ON rooms(property_id, number)`,
  `CREATE INDEX IF NOT EXISTS idx_rooms_property_status ON rooms(property_id, occupancy_status, operational_status)`,
  `CREATE INDEX IF NOT EXISTS idx_guests_property_name ON guests(property_id, full_name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_property_reference ON reservations(property_id, reference)`,
  `CREATE INDEX IF NOT EXISTS idx_reservations_property_dates ON reservations(property_id, arrival_date, departure_date)`,
  `CREATE INDEX IF NOT EXISTS idx_reservations_property_status ON reservations(property_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_folios_reservation ON folios(reservation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_folio_lines_folio ON folio_lines(folio_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_bills_property_reference ON offline_bills(property_id, offline_reference)`,
  `CREATE INDEX IF NOT EXISTS idx_housekeeping_property_status ON housekeeping_tasks(property_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_room_inspections_task ON room_inspections(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_room_inspections_reservation ON room_inspections(reservation_id, completed_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_damage_policy_property_severity_active ON damage_policy_rules(property_id, severity) WHERE active = 1`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_damage_reports_inspection ON damage_reports(inspection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_damage_reports_property_status ON damage_reports(property_id, status, reported_at)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_property_category ON inventory_items(property_id, category)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_meal_reservation_date_period ON restaurant_meal_bookings(reservation_id, service_date, meal_period)`,
  `CREATE INDEX IF NOT EXISTS idx_restaurant_meal_property_date_period ON restaurant_meal_bookings(property_id, service_date, meal_period)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_property_time ON audit_logs(property_id, timestamp)`,
  `CREATE INDEX IF NOT EXISTS idx_inquiries_org_status ON inquiries(organisation_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_travel_assets_org_active ON travel_assets(organisation_id, active, category)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_packages_org_reference ON custom_travel_packages(organisation_id, reference)`,
  `CREATE INDEX IF NOT EXISTS idx_custom_packages_org_status ON custom_travel_packages(organisation_id, status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_custom_package_items_package ON custom_travel_package_items(package_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discount_requests_org_status ON travel_discount_requests(organisation_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_discount_requests_package_version ON travel_discount_requests(package_id, package_version)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_provider_reference ON integration_events(provider, provider_reference) WHERE provider_reference IS NOT NULL`,
  `PRAGMA optimize`,
];

/** Compatibility wrapper for the demo API only. */
export function actorFromRequest(request: Request): Actor {
  return demoActorFromRequest(request);
}

/** Demo-only runtime schema/seed helper; production uses Drizzle migrations. */
export async function ensureDemoDatabase(): Promise<void> {
  assertDemoMode();
  initialization ??= initialize();
  return initialization;
}

async function initialize() {
  const database = env.DB;
  for (let index = 0; index < schemaStatements.length; index += 20) {
    await database.batch(schemaStatements.slice(index, index + 20).map((statement) => database.prepare(statement)));
  }
  await ensureOperationalColumns(database);
  const [organisation, rooms] = await Promise.all([
    database.prepare('SELECT COUNT(*) AS count FROM organisations WHERE id = ?').bind(ORGANISATION_ID).first<{ count: number }>(),
    database.prepare('SELECT COUNT(*) AS count FROM rooms WHERE property_id = ?').bind(PROPERTY_ID).first<{ count: number }>(),
  ]);
  if (Number(organisation?.count ?? 0) === 0 || Number(rooms?.count ?? 0) < 24) await seed(database);
  await seedTravelReferenceData(database);
  await seedOperationalReferenceData(database);
}

async function ensureOperationalColumns(database: D1) {
  const housekeepingColumns = await database.prepare('PRAGMA table_info(housekeeping_tasks)').all<{ name: string }>();
  const housekeepingNames = new Set(housekeepingColumns.results.map((column) => column.name));
  const housekeepingAdditions: Array<[string, string]> = [
    ['reservation_id', 'TEXT'],
    ['task_type', "TEXT NOT NULL DEFAULT 'STAY_SERVICE'"],
    ['outcome', 'TEXT'],
    ['deferred_until', 'TEXT'],
    ['completed_at', 'TEXT'],
    ['updated_at', "TEXT NOT NULL DEFAULT ''"],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
  ];
  for (const [name, definition] of housekeepingAdditions) {
    if (!housekeepingNames.has(name)) await database.prepare(`ALTER TABLE housekeeping_tasks ADD COLUMN ${name} ${definition}`).run();
  }
  await database.prepare('CREATE INDEX IF NOT EXISTS idx_housekeeping_reservation_type ON housekeeping_tasks(reservation_id, task_type)').run();
  await database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_housekeeping_unique_checkout_inspection ON housekeeping_tasks(reservation_id, task_type) WHERE task_type = 'CHECKOUT_INSPECTION'").run();
  const inventoryColumns = await database.prepare('PRAGMA table_info(inventory_items)').all<{ name: string }>();
  if (!inventoryColumns.results.some((column) => column.name === 'department')) {
    await database.prepare("ALTER TABLE inventory_items ADD COLUMN department TEXT NOT NULL DEFAULT 'HOTEL'").run();
  }
  const damageColumns = await database.prepare('PRAGMA table_info(damage_reports)').all<{ name: string }>();
  const damageNames = new Set(damageColumns.results.map((column) => column.name));
  const damageAdditions: Array<[string, string]> = [
    ['policy_rule_id', 'TEXT'],
    ['policy_label', 'TEXT'],
    ['policy_liability_paise', 'INTEGER'],
    ['repair_cost_paise', 'INTEGER'],
    ['decision_note', 'TEXT'],
  ];
  for (const [name, definition] of damageAdditions) {
    if (!damageNames.has(name)) await database.prepare(`ALTER TABLE damage_reports ADD COLUMN ${name} ${definition}`).run();
  }
  await database.batch([
    database.prepare("UPDATE room_inspections SET damage_severity = CASE damage_severity WHEN 'MINOR' THEN 'LOW' WHEN 'MAJOR' THEN 'HIGH' ELSE damage_severity END WHERE damage_severity IN ('MINOR','MAJOR')"),
    database.prepare("UPDATE damage_reports SET severity = CASE severity WHEN 'MINOR' THEN 'LOW' WHEN 'MAJOR' THEN 'HIGH' ELSE severity END WHERE severity IN ('MINOR','MAJOR')"),
  ]);
}

async function seedOperationalReferenceData(database: D1) {
  const timestamp = DEMO_TIMESTAMP;
  const statements: D1PreparedStatement[] = [
    database.prepare("UPDATE inventory_items SET department = 'RESTAURANT' WHERE property_id = ? AND category IN ('Kitchen','Beverage','Restaurant','Restaurant Supplies')").bind(PROPERTY_ID),
    database.prepare("UPDATE housekeeping_tasks SET task_type = COALESCE(NULLIF(task_type, ''), 'STAY_SERVICE'), updated_at = COALESCE(NULLIF(updated_at, ''), scheduled_at), version = CASE WHEN version < 1 THEN 1 ELSE version END WHERE property_id = ?").bind(PROPERTY_ID),
  ];
  const restaurantInventory = [
    ['inventory-restaurant-oil', 'Cooking oil', 'Kitchen', 'litre', 18, 12, 16800],
    ['inventory-restaurant-coffee', 'Coffee beans', 'Beverage', 'kg', 9, 6, 78000],
    ['inventory-restaurant-produce', 'Fresh produce', 'Kitchen', 'crate', 7, 5, 135000],
  ] as const;
  restaurantInventory.forEach(([id, name, category, unit, current, minimum, cost]) => statements.push(
    database.prepare("INSERT OR IGNORE INTO inventory_items (id, property_id, name, category, department, unit, current_quantity, minimum_quantity, unit_cost_paise, updated_at) VALUES (?, ?, ?, ?, 'RESTAURANT', ?, ?, ?, ?, ?)").bind(id, PROPERTY_ID, name, category, unit, current, minimum, cost, timestamp),
  ));
  const damagePolicies = [
    [`damage-policy-low-${PROPERTY_ID}`, 'LOW', 'Cosmetic damage', 250000, 'CLEAN_AFTER_REPAIR'],
    [`damage-policy-medium-${PROPERTY_ID}`, 'MEDIUM', 'Repair required', 1500000, 'MAINTENANCE_REVIEW'],
    [`damage-policy-high-${PROPERTY_ID}`, 'HIGH', 'Major repair or replacement', 5000000, 'ROOM_OUT_OF_ORDER'],
  ] as const;
  damagePolicies.forEach(([id, severity, label, liabilityCapPaise, roomImpact]) => statements.push(
    database.prepare("INSERT OR IGNORE INTO damage_policy_rules (id, property_id, severity, label, liability_cap_paise, room_impact, active, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)").bind(id, PROPERTY_ID, severity, label, liabilityCapPaise, roomImpact, timestamp),
  ));
  statements.push(database.prepare(`UPDATE damage_reports SET
    policy_rule_id = (SELECT p.id FROM damage_policy_rules p WHERE p.property_id = damage_reports.property_id AND p.severity = damage_reports.severity AND p.active = 1 LIMIT 1),
    policy_label = (SELECT p.label FROM damage_policy_rules p WHERE p.property_id = damage_reports.property_id AND p.severity = damage_reports.severity AND p.active = 1 LIMIT 1),
    policy_liability_paise = (SELECT p.liability_cap_paise FROM damage_policy_rules p WHERE p.property_id = damage_reports.property_id AND p.severity = damage_reports.severity AND p.active = 1 LIMIT 1)
    WHERE property_id = ? AND (policy_rule_id IS NULL OR policy_label IS NULL OR policy_liability_paise IS NULL)`).bind(PROPERTY_ID));
  const mealSeeds = [
    ['reservation-bh-10541', DEMO_DATE, 'BREAKFAST', 1, 'Vegetarian'],
    ['reservation-bh-10541', DEMO_DATE, 'DINNER', 1, 'Vegetarian'],
    ['reservation-inhouse-2', DEMO_DATE, 'BREAKFAST', 1, null],
    ['reservation-inhouse-3', DEMO_DATE, 'LUNCH', 1, null],
    ['reservation-bh-10882', DEMO_DATE, 'DINNER', 2, null],
    ['reservation-bh-10879', DEMO_DATE, 'SUPPER', 2, null],
    ['reservation-bh-10874', DEMO_DATE, 'BREAKFAST', 1, null],
    ['reservation-bh-10871', DEMO_DATE, 'HIGH_TEA', 1, null],
    ['reservation-bh-10869', DEMO_DATE, 'LUNCH', 1, null],
  ] as const;
  mealSeeds.forEach(([reservationId, serviceDate, mealPeriod, guestCount, dietaryNotes]) => statements.push(
    database.prepare("INSERT OR IGNORE INTO restaurant_meal_bookings (id, property_id, reservation_id, service_date, meal_period, guest_count, status, dietary_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?)").bind(`meal-${reservationId}-${serviceDate}-${mealPeriod}`.toLowerCase(), PROPERTY_ID, reservationId, serviceDate, mealPeriod, guestCount, dietaryNotes, timestamp, timestamp),
  ));
  for (let index = 0; index < statements.length; index += 50) await database.batch(statements.slice(index, index + 50));
}

async function seedTravelReferenceData(database: D1) {
  const assets = [
    ['travel-asset-hotel', 'Boutique hotel night', 'Stay', 'Double room with breakfast', 'room / night', 720000],
    ['travel-asset-resort', 'Premium resort night', 'Stay', 'Premium room, breakfast and dinner', 'room / night', 1180000],
    ['travel-asset-sedan', 'Private sedan transfer', 'Transport', 'Airport or intercity private transfer', 'vehicle / day', 540000],
    ['travel-asset-coach', 'Air-conditioned coach', 'Transport', 'Group coach with driver', 'vehicle / day', 1680000],
    ['travel-asset-guide', 'Local destination guide', 'Experience', 'Licensed English/Hindi guide', 'guide / day', 380000],
    ['travel-asset-safari', 'Wildlife safari', 'Experience', 'Permit, vehicle and naturalist', 'guest', 620000],
    ['travel-asset-meals', 'Curated meal plan', 'Dining', 'Breakfast and dinner plan', 'guest / day', 185000],
    ['travel-asset-insurance', 'Travel protection', 'Protection', 'Domestic trip protection cover', 'guest', 95000],
  ] as const;
  const statements = assets.map(([id, name, category, description, pricingUnit, unitPricePaise]) => database
    .prepare('INSERT OR IGNORE INTO travel_assets (id, organisation_id, name, category, description, pricing_unit, unit_price_paise, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .bind(id, ORGANISATION_ID, name, category, description, pricingUnit, unitPricePaise, DEMO_TIMESTAMP));
  await database.batch(statements);
}

async function seed(database: D1) {
  const statements: D1PreparedStatement[] = [];
  const bind = (sql: string, ...values: unknown[]) => statements.push(database.prepare(sql.replace(/^INSERT INTO /, 'INSERT OR REPLACE INTO ')).bind(...values));
  bind('INSERT INTO organisations (id, name, created_at) VALUES (?, ?, ?)', ORGANISATION_ID, 'BrainADZ Hospitality Demo', DEMO_TIMESTAMP);
  bind('INSERT INTO properties (id, organisation_id, code, name, city, timezone, connection_status, last_sync_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', PROPERTY_ID, ORGANISATION_ID, 'MGH', 'Meridian Grand Hotel', 'Nagpur', 'Asia/Kolkata', 'ONLINE', DEMO_TIMESTAMP, 1);

  const users: Array<[string, string, AppRole]> = [
    ['Parth Babulkar', 'owner@demo.hospitalityos.brainadz.com', 'OWNER'], ['Arjun Khanna', 'manager@demo.hospitalityos.brainadz.com', 'MANAGER'],
    ['Priya Deshmukh', 'reception@demo.hospitalityos.brainadz.com', 'RECEPTION'], ['Neha Kulkarni', 'travel@demo.hospitalityos.brainadz.com', 'TRAVEL_AGENT'],
    ['Rohan Verma', 'tour.manager@demo.hospitalityos.brainadz.com', 'TOUR_MANAGER'], ['Aditi Mehta', 'accounts@demo.hospitalityos.brainadz.com', 'ACCOUNTS'],
    ['Sonal Pawar', 'housekeeping@demo.hospitalityos.brainadz.com', 'HOUSEKEEPING'], ['Kabir Shaikh', 'restaurant@demo.hospitalityos.brainadz.com', 'RESTAURANT'],
    ['Maya Iyer', 'reporting@demo.hospitalityos.brainadz.com', 'REPORTING'],
  ];
  users.forEach(([name, email, role], index) => bind('INSERT INTO app_users (id, organisation_id, property_id, name, email, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)', `user-${index + 1}`, ORGANISATION_ID, PROPERTY_ID, name, email, role, DEMO_TIMESTAMP));

  const roomNumbers = ['101','102','103','104','105','106','201','202','203','204','205','206','301','302','303','304','305','306','401','402','403','404','405','406'];
  const occupiedRooms = new Set(['204','101','102','103','104','105','106','201','202','203','205','206','301','302','303','304','305','306']);
  const dirtyRooms = new Set(['404','405']);
  roomNumbers.forEach((number) => {
    const floor = Number(number[0]);
    const roomType = floor === 1 ? 'Standard' : floor === 2 ? 'Deluxe' : floor === 3 ? 'Premium' : 'Suite';
    const baseRate = floor === 1 ? 480000 : floor === 2 ? 680000 : floor === 3 ? 850000 : 1250000;
    const operational = number === '406' ? 'MAINTENANCE' : dirtyRooms.has(number) ? 'DIRTY' : 'CLEAN';
    bind('INSERT INTO rooms (id, property_id, number, floor, room_type, base_rate_paise, occupancy_status, operational_status, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)', `room-${number}`, PROPERTY_ID, number, floor, roomType, baseRate, occupiedRooms.has(number) ? 'OCCUPIED' : 'VACANT', operational, DEMO_TIMESTAMP);
  });

  const guestNames = ['Arjun Sharma','Aarav Gupta','Ishita Nair','Dev Malhotra','Saanvi Reddy','Kunal Bose','Riya Singh','Aditya Patil','Anika Menon','Kabir Shah','Tara Jain','Reyansh Das','Myra Kulkarni','Vihaan Joshi','Diya Kapoor','Rohan Rao','Aisha Verma','Neel Mehta'];
  const inHouseRooms = ['204','101','102','103','104','105','106','201','202','203','205','206','301','302','303','304','305','306'];
  guestNames.forEach((name, index) => {
    const guestId = index === 0 ? 'guest-arjun-sharma' : `guest-inhouse-${index + 1}`;
    bind('INSERT INTO guests (id, property_id, full_name, email, phone, city, preferences, dietary_requirements, loyalty_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', guestId, PROPERTY_ID, name, `${name.toLowerCase().replaceAll(' ', '.')}@example.in`, `+91 98${String(12000000 + index).padStart(8, '0')}`, index % 3 === 0 ? 'Mumbai' : index % 3 === 1 ? 'Pune' : 'Nagpur', index % 2 === 0 ? 'Quiet room' : 'High floor', index === 0 ? 'Vegetarian' : null, index % 4 === 0 ? 'Gold' : 'Member', DEMO_TIMESTAMP, DEMO_TIMESTAMP);
    const reservationId = index === 0 ? 'reservation-bh-10541' : `reservation-inhouse-${index + 1}`;
    const reference = index === 0 ? 'BH-10541' : `BH-${10541 + index}`;
    const departure = index < 4 ? DEMO_DATE : '2026-08-26';
    const room = inHouseRooms[index];
    const type = Number(room[0]) === 1 ? 'Standard' : Number(room[0]) === 2 ? 'Deluxe' : 'Premium';
    const total = index === 0 ? 1103300 : 620000 + index * 21500;
    const subtotal = index === 0 ? 935000 : Math.round(total / 1.12);
    const tax = total - subtotal;
    bind('INSERT INTO reservations (id, property_id, reference, guest_id, room_id, room_type, arrival_date, departure_date, status, source, total_amount_paise, balance_paise, created_while_property_offline, contact_status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)', reservationId, PROPERTY_ID, reference, guestId, `room-${room}`, type, index % 2 === 0 ? '2026-08-22' : '2026-08-23', departure, 'CHECKED_IN', index % 3 === 0 ? 'DIRECT' : index % 3 === 1 ? 'OTA' : 'WEBSITE', total, index % 5 === 0 ? 250000 : 0, 'ACKNOWLEDGED', DEMO_TIMESTAMP, DEMO_TIMESTAMP);
    bind('INSERT INTO folios (id, property_id, reservation_id, status, subtotal_paise, tax_paise, total_paise, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)', `folio-${reservationId}`, PROPERTY_ID, reservationId, 'OPEN', subtotal, tax, total, DEMO_TIMESTAMP);
    if (index === 0) {
      bind('INSERT INTO folio_lines (id, folio_id, description, category, quantity, unit_amount_paise, tax_rate_bps, line_total_paise, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'line-arjun-room', `folio-${reservationId}`, 'Room Charges', 'ROOM', 1, 800000, 1800, 800000, 'CLOUD', DEMO_TIMESTAMP);
      bind('INSERT INTO folio_lines (id, folio_id, description, category, quantity, unit_amount_paise, tax_rate_bps, line_total_paise, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'line-arjun-restaurant', `folio-${reservationId}`, 'Restaurant', 'RESTAURANT', 1, 135000, 1800, 135000, 'CLOUD', DEMO_TIMESTAMP);
    } else {
      bind('INSERT INTO folio_lines (id, folio_id, description, category, quantity, unit_amount_paise, tax_rate_bps, line_total_paise, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', `line-${reservationId}-room`, `folio-${reservationId}`, 'Room charge', 'ROOM', 1, subtotal, 1200, subtotal, 'CLOUD', DEMO_TIMESTAMP);
    }
  });

  const arrivalGuests = [
    ['guest-meera','Meera Kapoor','BH-10882','401','Suite','12:30 PM'],
    ['guest-nikhil','Nikhil & Ananya Rao','BH-10879','402','Suite','01:15 PM'],
    ['guest-vikram','Vikram Joshi','BH-10874','403','Suite','02:00 PM'],
    ['guest-simran','Simran Kaur','BH-10871','404','Suite','03:30 PM'],
    ['guest-aman','Aman Tripathi','BH-10869','405','Suite','05:00 PM'],
  ];
  arrivalGuests.forEach(([guestId, name, reference, room, type], index) => {
    bind('INSERT INTO guests (id, property_id, full_name, email, phone, city, preferences, dietary_requirements, loyalty_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', guestId, PROPERTY_ID, name, `${guestId}@example.in`, `+91 97${String(33000000 + index).padStart(8, '0')}`, 'Mumbai', 'Late arrival', null, 'Member', DEMO_TIMESTAMP, DEMO_TIMESTAMP);
    const reservationId = `reservation-${reference.toLowerCase()}`;
    bind('INSERT INTO reservations (id, property_id, reference, guest_id, room_id, room_type, arrival_date, departure_date, status, source, total_amount_paise, balance_paise, created_while_property_offline, contact_status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)', reservationId, PROPERTY_ID, reference, guestId, `room-${room}`, type, DEMO_DATE, '2026-08-26', 'CONFIRMED', index % 2 === 0 ? 'WEBSITE' : 'OTA', 1850000 + index * 90000, index < 2 ? 850000 : 0, 'ACKNOWLEDGED', DEMO_TIMESTAMP, DEMO_TIMESTAMP);
    bind('INSERT INTO folios (id, property_id, reservation_id, status, subtotal_paise, tax_paise, total_paise, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)', `folio-${reservationId}`, PROPERTY_ID, reservationId, 'OPEN', 0, 0, 0, DEMO_TIMESTAMP);
  });

  bind('INSERT INTO housekeeping_tasks (id, property_id, room_id, assigned_to, priority, status, scheduled_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'hk-404', PROPERTY_ID, 'room-404', 'Sonal Pawar', 'HIGH', 'CLEANING', '2026-08-24T11:45:00.000Z', 'Arrival at 3:30 PM');
  bind('INSERT INTO housekeeping_tasks (id, property_id, room_id, assigned_to, priority, status, scheduled_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'hk-405', PROPERTY_ID, 'room-405', 'Deepa More', 'NORMAL', 'ASSIGNED', '2026-08-24T13:00:00.000Z', 'Arrival at 5:00 PM');
  bind('INSERT INTO maintenance_tickets (id, property_id, room_id, category, issue, severity, assigned_to, status, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 'MT-2041', PROPERTY_ID, 'room-406', 'HVAC', 'Air conditioner compressor inspection', 'HIGH', 'Rakesh Yadav', 'IN_PROGRESS', '2026-08-24T08:20:00.000Z');
  const inventory = [['Bath towels','Housekeeping','piece',26,30,42000],['Basmati rice','Kitchen','kg',14,20,9800],['Water bottles','Guest supplies','case',38,15,48000],['Toiletry kits','Housekeeping','kit',52,25,7600]] as const;
  inventory.forEach(([name, category, unit, current, minimum, cost], index) => bind('INSERT INTO inventory_items (id, property_id, name, category, unit, current_quantity, minimum_quantity, unit_cost_paise, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', `inventory-${index + 1}`, PROPERTY_ID, name, category, unit, current, minimum, cost, DEMO_TIMESTAMP));
  bind('INSERT INTO restaurant_orders (id, property_id, reservation_id, room_number, order_type, status, total_paise, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 'order-204', PROPERTY_ID, 'reservation-bh-10541', '204', 'ROOM_SERVICE', 'DELIVERED', 135000, 'POSTED_TO_ROOM', '2026-08-24T12:10:00.000Z');

  const packages = [['Royal Rajasthan Circuit',8,'Jaipur · Jodhpur · Udaipur',32,24,5899000],['Himalayan Escape',6,'Manali · Solang · Kasol',24,18,4299000],['Heritage Maharashtra',5,'Nagpur · Pench · Pachmarhi',28,11,3199000]] as const;
  packages.forEach(([name, days, locations, capacity, booked, price], index) => bind('INSERT INTO travel_packages (id, organisation_id, name, duration_days, locations, capacity, booked, selling_price_paise, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', `package-${index + 1}`, ORGANISATION_ID, name, days, locations, capacity, booked, price, 'ACTIVE'));
  const inquiries = [['INQ-2048','Rhea Sharma','Website','Neha Kulkarni','Rajasthan group tour',4800000,'FOLLOW_UP','2026-08-24T15:00:00.000Z'],['INQ-2047','Harsh Mehta','Referral','Neha Kulkarni','Premium hotel stay',1650000,'NEGOTIATION','2026-08-25T10:30:00.000Z'],['INQ-2046','Priyanka Nair','Instagram','Rohan Verma','Himalayan couple package',8200000,'NEW','2026-08-24T17:00:00.000Z']] as const;
  inquiries.forEach(([reference, customer, source, owner, service, value, status, followUp], index) => bind('INSERT INTO inquiries (id, organisation_id, reference, customer_name, source, owner, service, estimated_value_paise, status, follow_up_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', `inquiry-${index + 1}`, ORGANISATION_ID, reference, customer, source, owner, service, value, status, followUp, DEMO_TIMESTAMP));
  bind('INSERT INTO integration_events (id, property_id, provider, event_type, status, provider_reference, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'integration-godrej-1', PROPERTY_ID, 'GODREJ', 'ROOM_STATUS_SIMULATOR', 'AWAITING_API', 'SANDBOX-001', '{"capability":"room-status","mode":"SANDBOX"}', DEMO_TIMESTAMP);
  bind('INSERT INTO audit_logs (id, timestamp, actor_id, actor_name, role, property_id, device_id, action, entity, entity_id, previous_value, new_value, source, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 'audit-seed-brainadz', DEMO_TIMESTAMP, 'system', 'Demo seed', 'OWNER', PROPERTY_ID, null, 'DEMO_DATA_SEEDED', 'PROPERTY', PROPERTY_ID, null, '{"rooms":24}', 'CLOUD', 'seed-brainadz-20260824');

  for (let index = 0; index < statements.length; index += 50) await database.batch(statements.slice(index, index + 50));
}

export async function getDemoState(actor: Actor, businessUnit: BusinessUnit = 'HOTEL') {
  assertRoleCan(actor.role, 'dashboard.read');
  if (businessUnit === 'TRAVEL') assertRoleCan(actor.role, 'travel.read');
  await ensureDemoDatabase();
  const database = env.DB;
  const auditQuery = businessUnit === 'TRAVEL'
    ? "SELECT id, timestamp, actor_name AS actorName, role, action, entity, entity_id AS entityId, previous_value AS previousValue, new_value AS newValue, source, correlation_id AS correlationId FROM audit_logs WHERE property_id = ? AND entity IN ('CUSTOM_TRAVEL_PACKAGE','TRAVEL_DISCOUNT_REQUEST') ORDER BY timestamp DESC, id DESC LIMIT 50"
    : "SELECT id, timestamp, actor_name AS actorName, role, action, entity, entity_id AS entityId, previous_value AS previousValue, new_value AS newValue, source, correlation_id AS correlationId FROM audit_logs WHERE property_id = ? AND entity NOT IN ('CUSTOM_TRAVEL_PACKAGE','TRAVEL_DISCOUNT_REQUEST') ORDER BY timestamp DESC, id DESC LIMIT 50";
  const [property, rooms, reservations, folios, lines, offlineBills, housekeeping, maintenance, inventory, orders, mealBookings, reservationInspections, damageReports, packages, inquiries, travelAssets, customPackages, customPackageItems, discountRequests, audit] = await Promise.all([
    database.prepare('SELECT id, name, code, city, timezone, connection_status AS connectionStatus, last_sync_at AS lastSyncAt, version FROM properties WHERE id = ?').bind(PROPERTY_ID).first(),
    database.prepare('SELECT id, number, floor, room_type AS roomType, base_rate_paise AS baseRatePaise, occupancy_status AS occupancyStatus, operational_status AS operationalStatus FROM rooms WHERE property_id = ? ORDER BY number').bind(PROPERTY_ID).all(),
    database.prepare(`SELECT r.id, r.reference, r.arrival_date AS arrivalDate, r.departure_date AS departureDate, r.status, r.source, r.total_amount_paise AS totalAmountPaise, r.balance_paise AS balancePaise, r.created_while_property_offline AS createdWhilePropertyOffline, r.contact_status AS contactStatus, r.room_type AS roomType, r.room_id AS roomId, g.id AS guestId, g.full_name AS guestName, g.email, g.phone, g.city, g.preferences, g.dietary_requirements AS dietaryRequirements, g.loyalty_tier AS loyaltyTier, rm.number AS roomNumber FROM reservations r JOIN guests g ON g.id = r.guest_id LEFT JOIN rooms rm ON rm.id = r.room_id WHERE r.property_id = ? ORDER BY r.arrival_date, r.reference DESC`).bind(PROPERTY_ID).all(),
    database.prepare('SELECT id, reservation_id AS reservationId, status, subtotal_paise AS subtotalPaise, tax_paise AS taxPaise, total_paise AS totalPaise, version, updated_at AS updatedAt FROM folios WHERE property_id = ?').bind(PROPERTY_ID).all(),
    database.prepare(`SELECT fl.id, fl.folio_id AS folioId, fl.description, fl.category, fl.quantity, fl.unit_amount_paise AS unitAmountPaise, fl.tax_rate_bps AS taxRateBps, fl.line_total_paise AS lineTotalPaise, fl.source, fl.created_at AS createdAt FROM folio_lines fl JOIN folios f ON f.id = fl.folio_id WHERE f.property_id = ? ORDER BY fl.created_at`).bind(PROPERTY_ID).all(),
    database.prepare('SELECT id, offline_reference AS offlineReference, reservation_id AS reservationId, booking_reference AS bookingReference, guest_id AS guestId, device_id AS deviceId, generated_by AS generatedBy, local_amount_paise AS localAmountPaise, tax_paise AS taxPaise, cloud_amount_paise AS cloudAmountPaise, currency, status, document_hash AS documentHash, notes, generated_at AS generatedAt, verified_at AS verifiedAt, verified_by AS verifiedBy FROM offline_bills WHERE property_id = ? ORDER BY generated_at DESC').bind(PROPERTY_ID).all(),
    database.prepare(`SELECT h.id, h.reservation_id AS reservationId, r.number AS roomNumber, h.assigned_to AS assignedTo, h.task_type AS taskType, h.priority, h.status, h.outcome, h.scheduled_at AS scheduledAt, h.deferred_until AS deferredUntil, h.completed_at AS completedAt, h.updated_at AS updatedAt, h.version, h.notes FROM housekeeping_tasks h JOIN rooms r ON r.id = h.room_id WHERE h.property_id = ? ORDER BY CASE WHEN h.status = 'DEFERRED' THEN h.deferred_until ELSE h.scheduled_at END`).bind(PROPERTY_ID).all(),
    database.prepare(`SELECT m.id, r.number AS roomNumber, m.category, m.issue, m.severity, m.assigned_to AS assignedTo, m.status, m.opened_at AS openedAt FROM maintenance_tickets m LEFT JOIN rooms r ON r.id = m.room_id WHERE m.property_id = ? ORDER BY m.opened_at DESC`).bind(PROPERTY_ID).all(),
    database.prepare('SELECT id, name, category, department, unit, current_quantity AS currentQuantity, minimum_quantity AS minimumQuantity, unit_cost_paise AS unitCostPaise, updated_at AS updatedAt FROM inventory_items WHERE property_id = ? ORDER BY name').bind(PROPERTY_ID).all(),
    database.prepare('SELECT id, reservation_id AS reservationId, room_number AS roomNumber, order_type AS orderType, status, total_paise AS totalPaise, payment_status AS paymentStatus, created_at AS createdAt FROM restaurant_orders WHERE property_id = ? ORDER BY created_at DESC').bind(PROPERTY_ID).all(),
    database.prepare(`SELECT mb.id, mb.reservation_id AS reservationId, r.reference AS bookingReference, rm.number AS roomNumber, mb.service_date AS serviceDate, mb.meal_period AS mealPeriod, mb.guest_count AS guestCount, mb.status, mb.dietary_notes AS dietaryNotes, r.arrival_date AS arrivalDate, r.departure_date AS departureDate, r.status AS reservationStatus FROM restaurant_meal_bookings mb JOIN reservations r ON r.id = mb.reservation_id LEFT JOIN rooms rm ON rm.id = r.room_id WHERE mb.property_id = ? ORDER BY mb.service_date, mb.meal_period, rm.number`).bind(PROPERTY_ID).all(),
    database.prepare(`SELECT r.id AS reservationId, r.reference AS bookingReference, rm.number AS roomNumber, h.id AS taskId, h.status AS taskStatus, h.outcome AS taskOutcome, h.version AS taskVersion, ri.id AS inspectionId, ri.result, ri.notes AS inspectionNotes, ri.damage_severity AS severity, ri.completed_by AS completedBy, ri.completed_at AS completedAt, d.id AS damageReportId, d.status AS damageStatus, d.description AS damageDescription, d.policy_rule_id AS policyRuleId, d.policy_label AS policyLabel, d.policy_liability_paise AS policyLiabilityPaise, d.repair_cost_paise AS repairCostPaise, d.charge_amount_paise AS chargeAmountPaise, d.decision_note AS decisionNote, d.reported_by AS reportedBy, d.reported_at AS reportedAt, d.reviewed_by AS reviewedBy, d.reviewed_at AS reviewedAt, d.version AS damageVersion, f.id AS folioId, f.status AS folioStatus, CASE WHEN ri.id IS NULL THEN 'PENDING' WHEN ri.result = 'NO_DAMAGE' THEN 'CLEARED' WHEN d.status = 'PENDING_REVIEW' OR d.status LIKE 'PROCESSING_%' THEN 'DAMAGE_REVIEW' WHEN d.status = 'CHARGED' THEN 'DAMAGE_CHARGED' WHEN d.status = 'WAIVED' THEN 'DAMAGE_WAIVED' ELSE 'DAMAGE_REPORTED' END AS inspectionStatus FROM reservations r JOIN housekeeping_tasks h ON h.reservation_id = r.id AND h.task_type = 'CHECKOUT_INSPECTION' LEFT JOIN rooms rm ON rm.id = h.room_id LEFT JOIN room_inspections ri ON ri.task_id = h.id LEFT JOIN damage_reports d ON d.inspection_id = ri.id JOIN folios f ON f.reservation_id = r.id WHERE r.property_id = ? ORDER BY h.scheduled_at DESC`).bind(PROPERTY_ID).all(),
    database.prepare(`SELECT d.id, d.inspection_id AS inspectionId, d.reservation_id AS reservationId, r.reference AS bookingReference, rm.number AS roomNumber, d.folio_id AS folioId, d.description, d.severity, d.status, d.policy_rule_id AS policyRuleId, d.policy_label AS policyLabel, d.policy_liability_paise AS policyLiabilityPaise, d.repair_cost_paise AS repairCostPaise, d.charge_amount_paise AS chargeAmountPaise, d.folio_line_id AS folioLineId, d.decision_note AS decisionNote, d.reported_by AS reportedBy, d.reported_at AS reportedAt, d.reviewed_by AS reviewedBy, d.reviewed_at AS reviewedAt, d.version FROM damage_reports d JOIN reservations r ON r.id = d.reservation_id JOIN rooms rm ON rm.id = d.room_id WHERE d.property_id = ? ORDER BY d.reported_at DESC`).bind(PROPERTY_ID).all(),
    database.prepare('SELECT id, name, duration_days AS durationDays, locations, capacity, booked, selling_price_paise AS sellingPricePaise, status FROM travel_packages WHERE organisation_id = ?').bind(ORGANISATION_ID).all(),
    database.prepare('SELECT id, reference, customer_name AS customerName, source, owner, service, estimated_value_paise AS estimatedValuePaise, status, follow_up_at AS followUpAt, created_at AS createdAt FROM inquiries WHERE organisation_id = ? ORDER BY created_at DESC').bind(ORGANISATION_ID).all(),
    database.prepare('SELECT id, name, category, description, pricing_unit AS pricingUnit, unit_price_paise AS unitPricePaise, active, updated_at AS updatedAt FROM travel_assets WHERE organisation_id = ? AND active = 1 ORDER BY category, name').bind(ORGANISATION_ID).all(),
    database.prepare('SELECT id, reference, client_name AS clientName, name, owner_id AS ownerId, owner_name AS ownerName, asset_subtotal_paise AS assetSubtotalPaise, base_price_paise AS basePricePaise, floor_price_paise AS floorPricePaise, quoted_price_paise AS quotedPricePaise, status, version, created_at AS createdAt, updated_at AS updatedAt FROM custom_travel_packages WHERE organisation_id = ? ORDER BY updated_at DESC').bind(ORGANISATION_ID).all(),
    database.prepare(`SELECT i.id, i.package_id AS packageId, i.asset_id AS assetId, i.asset_name AS assetName, i.category, i.pricing_unit AS pricingUnit, i.quantity, i.unit_price_paise AS unitPricePaise, i.line_total_paise AS lineTotalPaise FROM custom_travel_package_items i JOIN custom_travel_packages p ON p.id = i.package_id WHERE p.organisation_id = ? ORDER BY i.category, i.asset_name`).bind(ORGANISATION_ID).all(),
    database.prepare(`SELECT d.id, d.package_id AS packageId, p.reference AS packageReference, p.name AS packageName, p.client_name AS clientName, d.package_version AS packageVersion, d.requested_by_id AS requestedById, d.requested_by_name AS requestedByName, d.requested_price_paise AS requestedPricePaise, d.base_price_paise AS basePricePaise, d.floor_price_paise AS floorPricePaise, d.reason, d.status, d.reviewed_by_id AS reviewedById, d.reviewed_by_name AS reviewedByName, d.decision_note AS decisionNote, d.created_at AS createdAt, d.decided_at AS decidedAt FROM travel_discount_requests d JOIN custom_travel_packages p ON p.id = d.package_id WHERE d.organisation_id = ? ORDER BY d.created_at DESC`).bind(ORGANISATION_ID).all(),
    database.prepare(auditQuery).bind(PROPERTY_ID).all(),
  ]);

  const roomRows = rooms.results as Array<Record<string, unknown>>;
  if (!property) throw new DomainError('DEMO_PROPERTY_NOT_FOUND', 'The neutral demo property could not be initialized.', 500);
  const reservationRows = reservations.results as Array<Record<string, unknown>>;
  const folioRows = folios.results as Array<Record<string, unknown>>;
  const occupancyCount = roomRows.filter((room) => room.occupancyStatus === 'OCCUPIED').length;
  const arrivalsToday = reservationRows.filter((reservation) => reservation.arrivalDate === DEMO_DATE && ['CONFIRMED', 'HELD'].includes(String(reservation.status))).length;
  const departuresToday = reservationRows.filter((reservation) => reservation.departureDate === DEMO_DATE && reservation.status === 'CHECKED_IN').length;
  const revenuePaise = folioRows.reduce((sum, folio) => sum + Number(folio.totalPaise ?? 0), 0);
  const paidRooms = Math.max(occupancyCount, 1);
  const metrics = {
    occupancyPercent: Math.round((occupancyCount / Math.max(roomRows.length, 1)) * 100),
    totalRooms: roomRows.length,
    occupiedRooms: occupancyCount,
    availableRooms: roomRows.filter((room) => room.occupancyStatus === 'VACANT').length,
    readyRooms: roomRows.filter((room) => room.occupancyStatus === 'VACANT' && room.operationalStatus === 'CLEAN').length,
    dirtyRooms: roomRows.filter((room) => room.operationalStatus === 'DIRTY').length,
    maintenanceRooms: roomRows.filter((room) => room.operationalStatus === 'MAINTENANCE').length,
    arrivalsToday,
    departuresToday,
    inHouseGuests: reservationRows.filter((reservation) => reservation.status === 'CHECKED_IN').length,
    pendingPayments: reservationRows.filter((reservation) => Number(reservation.balancePaise) > 0).length,
    revenuePaise,
    adrPaise: Math.round(revenuePaise / paidRooms),
    revParPaise: Math.round(revenuePaise / Math.max(roomRows.length, 1)),
    lowStockCount: (inventory.results as Array<Record<string, unknown>>).filter((item) => Number(item.currentQuantity) <= Number(item.minimumQuantity)).length,
    unresolvedMaintenance: (maintenance.results as Array<Record<string, unknown>>).filter((ticket) => !['RESOLVED', 'CLOSED'].includes(String(ticket.status))).length,
    overdueFollowUps: (inquiries.results as Array<Record<string, unknown>>).filter((inquiry) => String(inquiry.followUpAt ?? '') < `${DEMO_DATE}T23:59:59.999Z` && !['CONVERTED', 'LOST'].includes(String(inquiry.status))).length,
  };

  const canReadReservations = roleCan(actor.role, 'reservation.read');
  const canReadGuests = roleCan(actor.role, 'guest.read');
  const canReadFolios = roleCan(actor.role, 'folio.read');
  const canUseOfflineCache = roleCan(actor.role, 'offline.cached.read');
  const canReviewOfflineBills = roleCan(actor.role, 'offline.bill.verify');
  const canOperateHotel = ['OWNER', 'MANAGER', 'HOUSEKEEPING'].includes(actor.role);
  const canReadRestaurantOrders = ['OWNER', 'MANAGER', 'ACCOUNTS', 'RESTAURANT'].includes(actor.role);
  const canReadRestaurantOperations = ['OWNER', 'MANAGER', 'RESTAURANT'].includes(actor.role);
  const canReadDamageSummaries = canReadReservations && roleCan(actor.role, 'damage.read');
  const canReviewDamage = roleCan(actor.role, 'damage.review');
  const canReadTravel = roleCan(actor.role, 'travel.read');
  const canReadAudit = ['OWNER', 'MANAGER', 'ACCOUNTS'].includes(actor.role);
  const hotelWorkspace = businessUnit === 'HOTEL';
  const travelWorkspace = businessUnit === 'TRAVEL';
  const customPackageRows = customPackages.results as Array<Record<string, unknown>>;
  const discountRequestRows = discountRequests.results as Array<Record<string, unknown>>;
  const visibleCustomPackages = roleCan(actor.role, 'travel.pricing.manage') ? customPackageRows : customPackageRows.filter((item) => item.ownerId === actor.id);
  const visiblePackageIds = new Set(visibleCustomPackages.map((item) => String(item.id)));
  const visibleDiscountRequests = roleCan(actor.role, 'travel.discount.approve') ? discountRequestRows : discountRequestRows.filter((item) => item.requestedById === actor.id);
  const housekeepingRows = housekeeping.results as Array<Record<string, unknown>>;
  const activeHousekeepingRows = housekeepingRows.filter((item) => !['COMPLETED', 'CANCELLED'].includes(String(item.status)));
  const inventoryRows = inventory.results as Array<Record<string, unknown>>;
  const visibleInventory = actor.role === 'RESTAURANT' ? inventoryRows.filter((item) => item.department === 'RESTAURANT') : actor.role === 'HOUSEKEEPING' ? [] : inventoryRows;
  const mealBookingRows = mealBookings.results as Array<Record<string, unknown>>;
  const restaurantArrivalRows = reservationRows.filter((item) => ['CONFIRMED', 'HELD'].includes(String(item.status))).map((item) => {
    const relatedMeals = mealBookingRows.filter((meal) => meal.reservationId === item.id);
    return {
      reservationId: item.id,
      bookingReference: item.reference,
      roomNumber: item.roomNumber,
      roomType: item.roomType,
      arrivalDate: item.arrivalDate,
      departureDate: item.departureDate,
      guestCount: relatedMeals.length ? Math.max(...relatedMeals.map((meal) => Number(meal.guestCount ?? 1))) : 1,
    };
  });
  const focusedOperationalRole = actor.role === 'HOUSEKEEPING' || actor.role === 'RESTAURANT';
  const visibleMetrics = actor.role === 'RESTAURANT' ? {
    occupancyPercent: 0, totalRooms: 0, occupiedRooms: 0, availableRooms: 0, readyRooms: 0, dirtyRooms: 0,
    maintenanceRooms: 0, arrivalsToday, departuresToday: 0, inHouseGuests: 0, pendingPayments: 0,
    revenuePaise: 0, adrPaise: 0, revParPaise: 0,
    lowStockCount: visibleInventory.filter((item) => Number(item.currentQuantity) <= Number(item.minimumQuantity)).length,
    unresolvedMaintenance: 0, overdueFollowUps: 0,
  } : actor.role === 'HOUSEKEEPING' ? {
    occupancyPercent: 0, totalRooms: 0, occupiedRooms: 0, availableRooms: 0, readyRooms: 0,
    dirtyRooms: activeHousekeepingRows.length, maintenanceRooms: 0, arrivalsToday: 0, departuresToday: 0, inHouseGuests: 0, pendingPayments: 0,
    revenuePaise: 0, adrPaise: 0, revParPaise: 0, lowStockCount: 0, unresolvedMaintenance: 0, overdueFollowUps: 0,
  } : metrics;
  const permittedReservations = canReadReservations
    ? reservationRows.map((reservation) => canReadGuests ? reservation : {
        ...reservation,
        guestName: 'In-house guest',
        email: null,
        phone: null,
        city: null,
        preferences: null,
        dietaryRequirements: null,
        loyaltyTier: null,
      })
    : [];

  const cachePayload = hotelWorkspace && canUseOfflineCache ? {
    syncedAt: (property as Record<string, unknown>)?.lastSyncAt,
    property: hotelWorkspace ? property : { id: 'travel-workspace', name: 'Travel & Sales', code: 'TRAVEL', city: '', timezone: 'Asia/Kolkata', connectionStatus: 'ONLINE', lastSyncAt: now(), version: 1 },
    rooms: roomRows,
    reservations: reservationRows.filter((reservation) => ['CHECKED_IN', 'CONFIRMED'].includes(String(reservation.status))),
    folios: folioRows,
    folioLines: lines.results,
  } : undefined;

  return {
    actor,
    businessUnit,
    property,
    metrics: hotelWorkspace ? visibleMetrics : {
      occupancyPercent: 0, totalRooms: 0, occupiedRooms: 0, availableRooms: 0, readyRooms: 0, dirtyRooms: 0,
      maintenanceRooms: 0, arrivalsToday: 0, departuresToday: 0, inHouseGuests: 0, pendingPayments: 0,
      revenuePaise: 0, adrPaise: 0, revParPaise: 0, lowStockCount: 0, unresolvedMaintenance: 0, overdueFollowUps: 0,
    },
    travelMetrics: {
      activePackages: (packages.results as Array<Record<string, unknown>>).filter((item) => item.status === 'ACTIVE').length,
      openInquiries: (inquiries.results as Array<Record<string, unknown>>).filter((item) => !['CONVERTED', 'LOST'].includes(String(item.status))).length,
      pipelineValuePaise: (inquiries.results as Array<Record<string, unknown>>).filter((item) => !['CONVERTED', 'LOST'].includes(String(item.status))).reduce((sum, item) => sum + Number(item.estimatedValuePaise ?? 0), 0),
      customQuotes: visibleCustomPackages.length,
      pendingApprovals: visibleDiscountRequests.filter((item) => item.status === 'PENDING').length,
      overdueFollowUps: metrics.overdueFollowUps,
    },
    rooms: hotelWorkspace && !focusedOperationalRole ? roomRows : [],
    reservations: hotelWorkspace ? permittedReservations : [],
    folios: hotelWorkspace && canReadFolios ? folioRows : [],
    folioLines: hotelWorkspace && canReadFolios ? lines.results : [],
    offlineBills: hotelWorkspace && (canUseOfflineCache || canReviewOfflineBills) ? offlineBills.results : [],
    housekeeping: hotelWorkspace && canOperateHotel ? (actor.role === 'HOUSEKEEPING' ? activeHousekeepingRows : housekeepingRows) : [],
    maintenance: hotelWorkspace && ['OWNER', 'MANAGER'].includes(actor.role) ? maintenance.results : [],
    inventory: hotelWorkspace && (canOperateHotel || canReadRestaurantOperations) ? visibleInventory : [],
    restaurantOrders: hotelWorkspace && canReadRestaurantOrders ? orders.results : [],
    restaurantMealBookings: hotelWorkspace && canReadRestaurantOperations ? mealBookingRows : [],
    restaurantArrivals: hotelWorkspace && canReadRestaurantOperations ? restaurantArrivalRows : [],
    reservationInspectionSummaries: hotelWorkspace && canReadDamageSummaries ? reservationInspections.results : [],
    damageReports: hotelWorkspace && canReviewDamage ? damageReports.results : [],
    packages: travelWorkspace && canReadTravel ? packages.results : [],
    inquiries: travelWorkspace && canReadTravel ? inquiries.results : [],
    travelAssets: travelWorkspace && canReadTravel ? travelAssets.results : [],
    customPackages: travelWorkspace && canReadTravel ? visibleCustomPackages : [],
    customPackageItems: travelWorkspace && canReadTravel ? (customPackageItems.results as Array<Record<string, unknown>>).filter((item) => visiblePackageIds.has(String(item.packageId))) : [],
    discountRequests: travelWorkspace && canReadTravel ? visibleDiscountRequests : [],
    audit: canReadAudit ? audit.results : [],
    cachePayload,
    sandbox: {
      payment: 'SANDBOX',
      whatsapp: 'SANDBOX',
      email: 'SANDBOX',
      channelManager: 'SANDBOX',
      godrej: 'SANDBOX / AWAITING API',
    },
  };
}

export async function runCommand(actor: Actor, command: Record<string, unknown>) {
  await ensureDemoDatabase();
  const action = String(command.action ?? '');
  switch (action) {
    case 'SET_NETWORK':
      if (!demoFeatureEnabled('DEMO_NETWORK_SIMULATOR')) throw new DomainError('SIMULATOR_DISABLED', 'The UAT network simulator is disabled.', 403);
      return setNetwork(actor, String(command.status) === 'OFFLINE' ? 'OFFLINE' : 'ONLINE');
    case 'CREATE_RESERVATION': return createReservation(actor, command);
    case 'SYNC_OFFLINE_RESERVATION': return syncOfflineReservation(actor, command);
    case 'MARK_CONTACTED': return markContacted(actor, String(command.reservationId));
    case 'CHECK_IN': return checkIn(actor, String(command.reservationId), String(command.surface ?? 'PROPERTY'));
    case 'POST_RESTAURANT': return postRestaurant(actor, String(command.reservationId), Number(command.amountPaise), String(command.surface ?? 'PROPERTY'), String(command.clientOperationId ?? ''));
    case 'CHECK_OUT': return checkOut(actor, String(command.reservationId), String(command.surface ?? 'PROPERTY'));
    case 'MANUAL_MASTER_UPDATE': return manualMasterUpdate(actor, String(command.bookingReference), Number(command.amountPaise));
    case 'UPLOAD_OFFLINE_BILL': return uploadOfflineBill(actor, command);
    case 'VERIFY_OFFLINE_BILL': return verifyOfflineBill(actor, String(command.offlineBillId));
    case 'UPDATE_HOUSEKEEPING': return updateHousekeeping(actor, String(command.taskId), String(command.expectedStatus), String(command.status), String(command.surface ?? 'PROPERTY'));
    case 'RECORD_HOUSEKEEPING_OUTCOME': return recordHousekeepingOutcome(actor, command);
    case 'SUBMIT_ROOM_INSPECTION': return submitRoomInspection(actor, command);
    case 'RESOLVE_DAMAGE_REPORT': return resolveDamageReport(actor, command);
    case 'UPSERT_INVENTORY': return upsertInventory(actor, command);
    case 'CREATE_CUSTOM_PACKAGE': return createCustomPackage(actor, command);
    case 'SET_PACKAGE_PRICING': return setPackagePricing(actor, command);
    case 'RESOLVE_DISCOUNT_REQUEST': return resolveDiscountRequest(actor, command);
    default: throw new DomainError('UNKNOWN_COMMAND', 'Unsupported operation.', 400);
  }
}

export async function ingestExternalBooking(input: Record<string, unknown>) {
  await ensureDemoDatabase();
  const actor: Actor = { id: 'system-channel-manager', name: 'Channel Manager', email: 'integration@brainadz.com', role: 'OWNER' };
  return createReservation(actor, { ...input, surface: 'MASTER_HUB', integrationAuthenticated: true });
}

async function propertyStatus() {
  const row = await env.DB.prepare('SELECT connection_status AS status FROM properties WHERE id = ?').bind(PROPERTY_ID).first<{ status: string }>();
  return row?.status ?? 'ONLINE';
}

function requirePermission(actor: Actor, permission: Permission) { assertRoleCan(actor.role, permission); }
function now() { return new Date().toISOString(); }
function correlationId() { return crypto.randomUUID(); }

type DamagePolicyRule = {
  id: string;
  severity: DamageSeverity;
  label: string;
  liabilityCapPaise: number;
  roomImpact: string;
  version: number;
};

async function activeDamagePolicy(database: D1, severity: DamageSeverity): Promise<DamagePolicyRule> {
  const policy = await database.prepare(`SELECT id, severity, label, liability_cap_paise AS liabilityCapPaise, room_impact AS roomImpact, version FROM damage_policy_rules WHERE property_id = ? AND severity = ? AND active = 1`).bind(PROPERTY_ID, severity).first<DamagePolicyRule>();
  if (!policy || !Number.isSafeInteger(policy.liabilityCapPaise) || policy.liabilityCapPaise <= 0) {
    throw new DomainError('DAMAGE_POLICY_NOT_CONFIGURED', `No active ${severity.toLowerCase()} damage policy is configured for this property.`, 409);
  }
  return policy;
}

const mealPeriods = ['BREAKFAST', 'BRUNCH', 'LUNCH', 'HIGH_TEA', 'DINNER', 'SUPPER'] as const;

function normalizeMealPlan(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = [...new Set(value.map((item) => String(item).toUpperCase()))];
  if (unique.some((item) => !mealPeriods.includes(item as (typeof mealPeriods)[number]))) {
    throw new DomainError('INVALID_MEAL_PERIOD', 'One or more meal selections are not supported.', 400);
  }
  return unique;
}

function mealServiceDates(arrivalDate: string, departureDate: string, mealPeriod: string): string[] {
  const dates: string[] = [];
  const morningService = mealPeriod === 'BREAKFAST' || mealPeriod === 'BRUNCH';
  const start = Date.parse(`${arrivalDate}T00:00:00Z`) + (morningService ? 86_400_000 : 0);
  const end = Date.parse(`${departureDate}T00:00:00Z`) + (morningService ? 86_400_000 : 0);
  for (let value = start; value < end; value += 86_400_000) {
    dates.push(new Date(value).toISOString().slice(0, 10));
  }
  return dates;
}

function mealBookingStatements(database: D1, input: {
  reservationId: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan: string[];
  guestCount: number;
  dietaryNotes: string | null;
  timestamp: string;
}) {
  return input.mealPlan.flatMap((mealPeriod) => mealServiceDates(input.arrivalDate, input.departureDate, mealPeriod).map((serviceDate) =>
    database.prepare("INSERT OR IGNORE INTO restaurant_meal_bookings (id, property_id, reservation_id, service_date, meal_period, guest_count, status, dietary_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED', ?, ?, ?)")
      .bind(crypto.randomUUID(), PROPERTY_ID, input.reservationId, serviceDate, mealPeriod, input.guestCount, input.dietaryNotes, input.timestamp, input.timestamp),
  ));
}

function auditStatement(database: D1, actor: Actor, action: string, entity: string, entityId: string, previousValue: unknown, newValue: unknown, source: string, correlation: string) {
  return database.prepare('INSERT INTO audit_logs (id, timestamp, actor_id, actor_name, role, property_id, device_id, action, entity, entity_id, previous_value, new_value, source, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), now(), actor.id, actor.name, actor.role, PROPERTY_ID, source === 'OFFLINE' ? 'BHZ-FD01' : null, action, entity, entityId, previousValue == null ? null : JSON.stringify(previousValue), newValue == null ? null : JSON.stringify(newValue), source, correlation);
}

async function setNetwork(actor: Actor, status: 'ONLINE' | 'OFFLINE') {
  requirePermission(actor, 'network.simulate');
  const database = env.DB;
  const previous = await propertyStatus();
  const timestamp = now();
  const correlation = correlationId();
  await database.batch([
    database.prepare('UPDATE properties SET connection_status = ?, last_sync_at = CASE WHEN ? = \'ONLINE\' THEN ? ELSE last_sync_at END, version = version + 1 WHERE id = ?').bind(status, status, timestamp, PROPERTY_ID),
    auditStatement(database, actor, status === 'OFFLINE' ? 'CONNECTION_LOSS_SIMULATED' : 'RECONNECTION', 'PROPERTY', PROPERTY_ID, { status: previous }, { status }, 'UAT_SIMULATOR', correlation),
  ]);
  const newReservations = status === 'ONLINE' ? await database.prepare('SELECT COUNT(*) AS count FROM reservations WHERE property_id = ? AND created_while_property_offline = 1').bind(PROPERTY_ID).first<{ count: number }>() : null;
  const pendingBills = status === 'ONLINE' ? await database.prepare("SELECT COUNT(*) AS count FROM offline_bills WHERE property_id = ? AND status != 'VERIFIED'").bind(PROPERTY_ID).first<{ count: number }>() : null;
  return { status, lastSyncAt: status === 'ONLINE' ? timestamp : undefined, reconnectSummary: status === 'ONLINE' ? { newReservations: Number(newReservations?.count ?? 0), updatedReservations: 1, offlineBillsPending: Number(pendingBills?.count ?? 0) } : null };
}

async function createReservation(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'reservation.write');
  const surface = String(command.surface ?? 'MASTER_HUB') as 'MASTER_HUB' | 'PROPERTY';
  const status = await propertyStatus();
  assertPropertyMutationAllowed(status === 'ONLINE', surface);
  const guestName = String(command.guestName ?? '').trim();
  const arrivalDate = String(command.arrivalDate ?? DEMO_DATE);
  const departureDate = String(command.departureDate ?? '2026-08-26');
  const roomType = String(command.roomType ?? 'Deluxe');
  const integrationAuthenticated = command.integrationAuthenticated === true && actor.id === 'system-channel-manager';
  const offlineSyncAuthenticated = command.offlineSyncAuthenticated === true && roleCan(actor.role, 'offline.reservation.create');
  const requestedSource = String(command.source ?? 'OTA').toUpperCase();
  const source = offlineSyncAuthenticated ? 'OFFLINE_WALK_IN' : integrationAuthenticated && ['OTA', 'WEBSITE'].includes(requestedSource) ? requestedSource : 'FRONT_DESK';
  const provider = offlineSyncAuthenticated ? 'OFFLINE_FRONT_DESK_BHZ_FD01' : source === 'WEBSITE' ? 'BOOKING_ENGINE_SANDBOX' : 'CHANNEL_MANAGER_SANDBOX';
  const providerReference = integrationAuthenticated || offlineSyncAuthenticated ? String(command.providerReference ?? '').trim() : '';
  const mealPlan = normalizeMealPlan(command.mealPlan);
  const guestCount = Number(command.guestCount ?? 1);
  const dietaryRequirements = String(command.dietaryRequirements ?? '').trim() || null;
  const offlineCreatedBy = offlineSyncAuthenticated ? {
    id: String(command.createdById ?? 'unknown-offline-user'),
    name: String(command.createdByName ?? 'Offline front desk'),
    role: String(command.createdByRole ?? 'RECEPTION'),
  } : null;
  if (guestName.length < 2) throw new DomainError('INVALID_GUEST', 'Guest name is required.', 400);
  if ((integrationAuthenticated || offlineSyncAuthenticated) && providerReference.length < 3) throw new DomainError('INVALID_PROVIDER_REFERENCE', 'Provider booking reference is required.', 400);
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 12) throw new DomainError('INVALID_GUEST_COUNT', 'Guest count must be between 1 and 12.', 400);
  validateStayDates(arrivalDate, departureDate);
  const database = env.DB;
  if (providerReference) {
    const prior = await database.prepare('SELECT payload FROM integration_events WHERE provider = ? AND provider_reference = ?').bind(provider, providerReference).first<{ payload: string }>();
    if (prior) {
      const payload = JSON.parse(prior.payload) as { reservationId: string; reference: string; roomNumber?: string };
      return { ...payload, idempotent: true, source, providerReference };
    }
  }
  const room = await database.prepare(`SELECT r.id, r.number, r.base_rate_paise AS baseRatePaise FROM rooms r WHERE r.property_id = ? AND r.room_type = ? AND r.operational_status != 'MAINTENANCE' AND NOT EXISTS (SELECT 1 FROM reservations x WHERE x.room_id = r.id AND x.status IN ('CONFIRMED','HELD','CHECKED_IN') AND x.arrival_date < ? AND x.departure_date > ?) ORDER BY r.number LIMIT 1`).bind(PROPERTY_ID, roomType, departureDate, arrivalDate).first<{ id: string; number: string; baseRatePaise: number }>();
  if (!room) throw new DomainError('NO_AVAILABILITY', `No ${roomType} room is available for those dates.`, 409);
  const localReference = String(command.localReference ?? '').trim();
  if (offlineSyncAuthenticated && localReference.length < 8) throw new DomainError('INVALID_LOCAL_REFERENCE', 'A local walk-in reference is required.', 400);
  const reference = offlineSyncAuthenticated ? localReference : `BH-${String(Date.now()).slice(-6)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const reservationId = crypto.randomUUID();
  const guestId = crypto.randomUUID();
  const folioId = crypto.randomUUID();
  const nights = calculateStayNights(arrivalDate, departureDate);
  if (nights > 90) throw new DomainError('STAY_TOO_LONG', 'Reservations are limited to 90 nights.', 400);
  const total = Number(room.baseRatePaise) * nights;
  const timestamp = now();
  const correlation = correlationId();
  const statements = [
    database.prepare('INSERT INTO guests (id, property_id, full_name, email, phone, city, preferences, dietary_requirements, loyalty_tier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(guestId, PROPERTY_ID, guestName, String(command.email ?? ''), String(command.phone ?? ''), String(command.city ?? ''), null, dietaryRequirements, 'New', timestamp, timestamp),
    database.prepare('INSERT INTO reservations (id, property_id, reference, guest_id, room_id, room_type, arrival_date, departure_date, status, source, total_amount_paise, balance_paise, created_while_property_offline, contact_status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)').bind(reservationId, PROPERTY_ID, reference, guestId, room.id, roomType, arrivalDate, departureDate, 'CONFIRMED', source, total, total, offlineSyncAuthenticated || status === 'OFFLINE' ? 1 : 0, status === 'OFFLINE' && !offlineSyncAuthenticated ? 'NOT_CONTACTED' : 'ACKNOWLEDGED', timestamp, timestamp),
    database.prepare('INSERT INTO folios (id, property_id, reservation_id, status, subtotal_paise, tax_paise, total_paise, version, updated_at) VALUES (?, ?, ?, ?, 0, 0, 0, 1, ?)').bind(folioId, PROPERTY_ID, reservationId, 'OPEN', timestamp),
    auditStatement(database, actor, 'BOOKING_CREATED', 'RESERVATION', reservationId, null, { reference, guestName, room: room.number, source, providerReference: providerReference || null, mealPlan, guestCount, createdWhilePropertyOffline: offlineSyncAuthenticated || status === 'OFFLINE', offlineCreatedBy }, offlineSyncAuthenticated ? 'OFFLINE_SYNC' : providerReference ? 'INTEGRATION' : 'CLOUD', correlation),
  ];
  statements.push(...mealBookingStatements(database, { reservationId, arrivalDate, departureDate, mealPlan, guestCount, dietaryNotes: dietaryRequirements, timestamp }));
  if (providerReference) statements.push(database.prepare('INSERT INTO integration_events (id, property_id, provider, event_type, status, provider_reference, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), PROPERTY_ID, provider, 'RESERVATION_RECEIVED', 'SUCCESSFUL', providerReference, JSON.stringify({ reservationId, reference, roomNumber: room.number }), timestamp));
  try {
    await database.batch(statements);
  } catch (error) {
    if (providerReference) {
      const prior = await database.prepare('SELECT payload FROM integration_events WHERE provider = ? AND provider_reference = ?').bind(provider, providerReference).first<{ payload: string }>();
      if (prior) {
        const payload = JSON.parse(prior.payload) as { reservationId: string; reference: string; roomNumber?: string };
        return { ...payload, idempotent: true, source, providerReference };
      }
    }
    throw error;
  }
  return { reservationId, reference, roomNumber: room.number, source, providerReference: providerReference || null, propertyOffline: status === 'OFFLINE', contactRequired: status === 'OFFLINE', mealPlan, guestCount };
}

async function syncOfflineReservation(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'offline.reservation.create');
  if (await propertyStatus() !== 'ONLINE') throw new DomainError('STILL_OFFLINE', 'The reservation remains saved on this device until connection returns.', 409);
  const clientOperationId = String(command.clientOperationId ?? '').trim();
  if (clientOperationId.length < 8) throw new DomainError('INVALID_CLIENT_OPERATION', 'A stable local reservation ID is required.', 400);
  return createReservation(actor, {
    ...command,
    action: 'CREATE_RESERVATION',
    surface: 'MASTER_HUB',
    source: 'OFFLINE_WALK_IN',
    providerReference: clientOperationId,
    offlineSyncAuthenticated: true,
  });
}

async function markContacted(actor: Actor, reservationId: string) {
  requirePermission(actor, 'reservation.write');
  const database = env.DB;
  const row = await database.prepare('SELECT contact_status AS contactStatus FROM reservations WHERE id = ? AND property_id = ?').bind(reservationId, PROPERTY_ID).first<{ contactStatus: string }>();
  if (!row) throw new DomainError('NOT_FOUND', 'Reservation not found.', 404);
  const correlation = correlationId();
  await database.batch([
    database.prepare("UPDATE reservations SET contact_status = 'CONTACTED', version = version + 1, updated_at = ? WHERE id = ? AND property_id = ?").bind(now(), reservationId, PROPERTY_ID),
    auditStatement(database, actor, 'PROPERTY_CONTACTED', 'RESERVATION', reservationId, { contactStatus: row.contactStatus }, { contactStatus: 'CONTACTED' }, 'CLOUD', correlation),
  ]);
  return { reservationId, contactStatus: 'CONTACTED' };
}

async function checkIn(actor: Actor, reservationId: string, surfaceValue: string) {
  requirePermission(actor, 'reservation.write');
  const status = await propertyStatus();
  const surface = surfaceValue === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY';
  assertPropertyMutationAllowed(status === 'ONLINE', surface);
  const database = env.DB;
  const reservation = await database.prepare('SELECT status, room_id AS roomId FROM reservations WHERE id = ? AND property_id = ?').bind(reservationId, PROPERTY_ID).first<{ status: string; roomId: string }>();
  if (!reservation) throw new DomainError('NOT_FOUND', 'Reservation not found.', 404);
  if (reservation.status !== 'CONFIRMED') throw new DomainError('INVALID_STATE', 'Only confirmed reservations can be checked in.', 409);
  const room = await database.prepare('SELECT operational_status AS operationalStatus, occupancy_status AS occupancyStatus FROM rooms WHERE id = ? AND property_id = ?').bind(reservation.roomId, PROPERTY_ID).first<{ operationalStatus: string; occupancyStatus: string }>();
  if (!room || room.operationalStatus !== 'CLEAN' || room.occupancyStatus !== 'VACANT') throw new DomainError('ROOM_NOT_READY', 'Assigned room is not clean and vacant.', 409);
  const correlation = correlationId();
  await database.batch([
    database.prepare("UPDATE reservations SET status = 'CHECKED_IN', version = version + 1, updated_at = ? WHERE id = ?").bind(now(), reservationId),
    database.prepare("UPDATE rooms SET occupancy_status = 'OCCUPIED', version = version + 1, updated_at = ? WHERE id = ?").bind(now(), reservation.roomId),
    auditStatement(database, actor, 'CHECK_IN', 'RESERVATION', reservationId, { status: reservation.status }, { status: 'CHECKED_IN' }, 'CLOUD', correlation),
  ]);
  return { reservationId, status: 'CHECKED_IN' };
}

async function postRestaurant(actor: Actor, reservationId: string, amountPaise: number, surfaceValue: string, clientOperationId: string) {
  requirePermission(actor, 'restaurant.charge.post');
  const status = await propertyStatus();
  assertPropertyMutationAllowed(status === 'ONLINE', surfaceValue === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > 5_000_000) throw new DomainError('INVALID_AMOUNT', 'Restaurant amount must be between ₹1 and ₹50,000.', 400);
  if (clientOperationId.trim().length < 8) throw new DomainError('INVALID_CLIENT_OPERATION', 'A stable restaurant posting ID is required.', 400);
  const database = env.DB;
  const provider = 'RESTAURANT_TERMINAL';
  const prior = await database.prepare('SELECT payload FROM integration_events WHERE provider = ? AND provider_reference = ?').bind(provider, clientOperationId).first<{ payload: string }>();
  if (prior) return { ...JSON.parse(prior.payload) as Record<string, unknown>, idempotent: true };
  const row = await database.prepare(`SELECT f.id AS folioId, f.subtotal_paise AS subtotalPaise, f.tax_paise AS taxPaise, f.total_paise AS totalPaise, r.status, rm.number AS roomNumber FROM folios f JOIN reservations r ON r.id = f.reservation_id LEFT JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ? AND r.property_id = ?`).bind(reservationId, PROPERTY_ID).first<{ folioId: string; subtotalPaise: number; taxPaise: number; totalPaise: number; status: string; roomNumber: string }>();
  if (!row || row.status !== 'CHECKED_IN') throw new DomainError('NO_ACTIVE_STAY', 'Restaurant charges require an active checked-in stay.', 409);
  const tax = Math.round(amountPaise * 0.05);
  const timestamp = now();
  const correlation = correlationId();
  const orderId = crypto.randomUUID();
  const result = { orderId, folioId: row.folioId, addedPaise: amountPaise + tax };
  try {
    await database.batch([
    database.prepare('INSERT INTO restaurant_orders (id, property_id, reservation_id, room_number, order_type, status, total_paise, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(orderId, PROPERTY_ID, reservationId, row.roomNumber, 'ROOM_SERVICE', 'DELIVERED', amountPaise + tax, 'POSTED_TO_ROOM', timestamp),
    database.prepare('INSERT INTO folio_lines (id, folio_id, description, category, quantity, unit_amount_paise, tax_rate_bps, line_total_paise, source, created_at) VALUES (?, ?, ?, ?, 1, ?, 500, ?, ?, ?)').bind(crypto.randomUUID(), row.folioId, 'Room service order', 'ROOM_SERVICE', amountPaise, amountPaise, 'RESTAURANT', timestamp),
    database.prepare('UPDATE folios SET subtotal_paise = subtotal_paise + ?, tax_paise = tax_paise + ?, total_paise = total_paise + ?, version = version + 1, updated_at = ? WHERE id = ?').bind(amountPaise, tax, amountPaise + tax, timestamp, row.folioId),
    auditStatement(database, actor, 'RESTAURANT_POSTED_TO_ROOM', 'FOLIO', row.folioId, { totalPaise: row.totalPaise }, { totalPaise: row.totalPaise + amountPaise + tax, orderId }, 'CLOUD', correlation),
    database.prepare('INSERT INTO integration_events (id, property_id, provider, event_type, status, provider_reference, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), PROPERTY_ID, provider, 'RESTAURANT_POSTED_TO_ROOM', 'SUCCESSFUL', clientOperationId, JSON.stringify(result), timestamp),
    ]);
  } catch (error) {
    const replay = await database.prepare('SELECT payload FROM integration_events WHERE provider = ? AND provider_reference = ?').bind(provider, clientOperationId).first<{ payload: string }>();
    if (replay) return { ...JSON.parse(replay.payload) as Record<string, unknown>, idempotent: true };
    throw error;
  }
  return result;
}

async function checkOut(actor: Actor, reservationId: string, surfaceValue: string) {
  requirePermission(actor, 'reservation.write');
  const status = await propertyStatus();
  assertPropertyMutationAllowed(status === 'ONLINE', surfaceValue === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  const database = env.DB;
  const row = await database.prepare(`SELECT r.status, r.room_id AS roomId, f.id AS folioId, f.status AS folioStatus FROM reservations r JOIN folios f ON f.reservation_id = r.id WHERE r.id = ? AND r.property_id = ?`).bind(reservationId, PROPERTY_ID).first<{ status: string; roomId: string; folioId: string; folioStatus: string }>();
  if (!row || row.status !== 'CHECKED_IN') throw new DomainError('INVALID_STATE', 'Only an in-house reservation can be checked out.', 409);
  const timestamp = now();
  const correlation = correlationId();
  let results;
  try {
    results = await database.batch([
    database.prepare("UPDATE reservations SET status = 'CHECKED_OUT', version = version + 1, updated_at = ? WHERE id = ? AND property_id = ? AND status = 'CHECKED_IN'").bind(timestamp, reservationId, PROPERTY_ID),
    database.prepare("UPDATE folios SET status = 'PENDING_INSPECTION', version = version + 1, updated_at = ? WHERE id = ?").bind(timestamp, row.folioId),
    database.prepare("UPDATE rooms SET occupancy_status = 'VACANT', operational_status = 'DIRTY', version = version + 1, updated_at = ? WHERE id = ?").bind(timestamp, row.roomId),
    database.prepare("INSERT INTO housekeeping_tasks (id, property_id, room_id, reservation_id, assigned_to, task_type, priority, status, outcome, scheduled_at, deferred_until, completed_at, updated_at, version, notes) VALUES (?, ?, ?, ?, NULL, 'CHECKOUT_INSPECTION', 'HIGH', 'NEEDS_INSPECTION', NULL, ?, NULL, NULL, ?, 1, ?)").bind(crypto.randomUUID(), PROPERTY_ID, row.roomId, reservationId, timestamp, timestamp, 'Inspect the room after checkout before final folio closure'),
    auditStatement(database, actor, 'CHECK_OUT', 'RESERVATION', reservationId, { status: row.status, folioStatus: row.folioStatus }, { status: 'CHECKED_OUT', folioStatus: 'PENDING_INSPECTION', inspectionRequired: true }, 'CLOUD', correlation),
    ]);
  } catch (error) {
    const latest = await database.prepare('SELECT status FROM reservations WHERE id = ? AND property_id = ?').bind(reservationId, PROPERTY_ID).first<{ status: string }>();
    if (latest?.status !== 'CHECKED_IN') throw new DomainError('INVALID_STATE', 'This reservation has already been checked out.', 409);
    throw error;
  }
  if (Number(results[0].meta.changes ?? 0) !== 1) throw new DomainError('INVALID_STATE', 'This reservation has already been checked out.', 409);
  return { reservationId, status: 'CHECKED_OUT', inspectionCreated: true };
}

async function manualMasterUpdate(actor: Actor, bookingReference: string, amountPaise: number) {
  requirePermission(actor, 'folio.write');
  if (!Number.isInteger(amountPaise) || amountPaise < 0) throw new DomainError('INVALID_AMOUNT', 'Amount must be a non-negative integer in paise.', 400);
  const database = env.DB;
  const row = await database.prepare(`SELECT r.id AS reservationId, f.id AS folioId, f.status AS folioStatus, f.subtotal_paise AS subtotalPaise, f.tax_paise AS taxPaise, f.total_paise AS totalPaise FROM reservations r JOIN folios f ON f.reservation_id = r.id WHERE r.property_id = ? AND r.reference = ?`).bind(PROPERTY_ID, bookingReference).first<{ reservationId: string; folioId: string; folioStatus: string; subtotalPaise: number; taxPaise: number; totalPaise: number }>();
  if (!row) throw new DomainError('NOT_FOUND', 'Cloud reservation/folio not found.', 404);
  if (['PENDING_INSPECTION', 'PENDING_DAMAGE_REVIEW'].includes(row.folioStatus) || row.folioStatus.startsWith('PROCESSING_')) {
    throw new DomainError('FOLIO_LOCKED_FOR_INSPECTION', 'Complete the room inspection and damage review before manually updating this folio.', 409);
  }
  const timestamp = now();
  const correlation = correlationId();
  const statements = [database.prepare("UPDATE folios SET status = 'MASTER_UPDATED', total_paise = ?, subtotal_paise = ?, tax_paise = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(amountPaise, Math.max(0, amountPaise - row.taxPaise), row.taxPaise, timestamp, row.folioId)];
  if (row.totalPaise !== amountPaise) {
    statements.push(database.prepare('INSERT INTO folio_lines (id, folio_id, description, category, quantity, unit_amount_paise, tax_rate_bps, line_total_paise, source, created_at) VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?)').bind(crypto.randomUUID(), row.folioId, 'Authorised manual Master Hub adjustment', 'ADJUSTMENT', amountPaise - row.totalPaise, amountPaise - row.totalPaise, 'MASTER_MANUAL', timestamp));
  }
  statements.push(auditStatement(database, actor, 'MASTER_FOLIO_MANUALLY_UPDATED', 'FOLIO', row.folioId, { totalPaise: row.totalPaise }, { totalPaise: amountPaise, source: 'operational communication' }, 'CLOUD', correlation));
  await database.batch(statements);
  return { bookingReference, folioId: row.folioId, amountPaise, createdFinancialLine: row.totalPaise !== amountPaise };
}

async function uploadOfflineBill(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'offline.bill.create');
  const database = env.DB;
  const id = String(command.id);
  const offlineReference = String(command.offlineReference);
  const bookingReference = String(command.bookingReference);
  const localAmountPaise = Number(command.localAmountPaise);
  const taxPaise = Number(command.taxPaise);
  const documentHash = String(command.documentHash);
  const generatedAt = String(command.generatedAt ?? now());
  const existing = await database.prepare('SELECT id, document_hash AS documentHash, status FROM offline_bills WHERE id = ?').bind(id).first<{ id: string; documentHash: string; status: string }>();
  if (existing) {
    if (existing.documentHash !== documentHash) throw new DomainError('IDEMPOTENCY_HASH_CONFLICT', 'Offline bill ID was reused with different document content.', 409);
    const documentKey = await persistOfflineDocument(id, String(command.documentBase64 ?? ''), documentHash);
    return { id, status: existing.status, documentKey, idempotent: true };
  }
  const cloud = await database.prepare(`SELECT r.id AS reservationId, r.guest_id AS guestId, r.reference AS bookingReference, f.total_paise AS cloudAmountPaise FROM reservations r LEFT JOIN folios f ON f.reservation_id = r.id WHERE r.property_id = ? AND r.reference = ?`).bind(PROPERTY_ID, bookingReference).first<{ reservationId: string; guestId: string; bookingReference: string; cloudAmountPaise: number }>();
  const reconciliationStatus = reconcileOfflineBill({ localBookingReference: bookingReference, localAmountPaise, cloudBookingReference: cloud?.bookingReference, cloudAmountPaise: cloud?.cloudAmountPaise });
  const documentKey = await persistOfflineDocument(id, String(command.documentBase64 ?? ''), documentHash);
  const correlation = correlationId();
  await database.batch([
    database.prepare('INSERT INTO offline_bills (id, property_id, offline_reference, reservation_id, booking_reference, guest_id, device_id, generated_by, local_amount_paise, tax_paise, cloud_amount_paise, currency, status, document_hash, notes, generated_at, verified_at, verified_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)').bind(id, PROPERTY_ID, offlineReference, cloud?.reservationId ?? 'unknown', bookingReference, cloud?.guestId ?? 'unknown', 'BHZ-FD01', actor.name, localAmountPaise, taxPaise, cloud?.cloudAmountPaise ?? null, 'INR', reconciliationStatus, documentHash, 'Reference upload for controlled reconciliation.', generatedAt),
    auditStatement(database, actor, 'OFFLINE_BILL_REFERENCE_UPLOADED', 'OFFLINE_BILL', id, null, { offlineReference, bookingReference, localAmountPaise, reconciliationStatus, documentKey, financialReplay: false }, 'RECONCILIATION', correlation),
  ]);
  return { id, status: reconciliationStatus, cloudAmountPaise: cloud?.cloudAmountPaise ?? null, documentKey, financialReplay: false };
}

async function persistOfflineDocument(id: string, documentBase64: string, expectedHash: string) {
  if (!documentBase64) throw new DomainError('DOCUMENT_REQUIRED', 'The retained offline PDF is required for upload.', 400);
  let binary: string;
  try {
    binary = atob(documentBase64);
  } catch {
    throw new DomainError('INVALID_DOCUMENT_ENCODING', 'Offline bill document is not valid base64.', 400);
  }
  if (binary.length > 5 * 1024 * 1024) throw new DomainError('DOCUMENT_TOO_LARGE', 'Offline bill document exceeds the 5 MB limit.', 413);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== '%PDF') throw new DomainError('INVALID_DOCUMENT_TYPE', 'Offline bill document must be a PDF.', 400);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const actualHash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actualHash !== expectedHash) throw new DomainError('DOCUMENT_HASH_MISMATCH', 'Offline bill document failed integrity verification.', 409);
  const key = `offline-bills/${PROPERTY_ID}/${id}.pdf`;
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: 'application/pdf', contentDisposition: `attachment; filename="${id}.pdf"` },
    customMetadata: { propertyId: PROPERTY_ID, billId: id, sha256: actualHash },
  });
  return key;
}

async function verifyOfflineBill(actor: Actor, offlineBillId: string) {
  requirePermission(actor, 'offline.bill.verify');
  const database = env.DB;
  const row = await database.prepare(`SELECT ob.id, ob.status, ob.local_amount_paise AS localAmountPaise, ob.booking_reference AS bookingReference, f.total_paise AS cloudAmountPaise FROM offline_bills ob LEFT JOIN reservations r ON r.id = ob.reservation_id LEFT JOIN folios f ON f.reservation_id = r.id WHERE ob.id = ? AND ob.property_id = ?`).bind(offlineBillId, PROPERTY_ID).first<{ id: string; status: string; localAmountPaise: number; bookingReference: string; cloudAmountPaise: number | null }>();
  if (!row) throw new DomainError('NOT_FOUND', 'Offline bill not found.', 404);
  const match = reconcileOfflineBill({ localBookingReference: row.bookingReference, localAmountPaise: row.localAmountPaise, cloudBookingReference: row.bookingReference, cloudAmountPaise: row.cloudAmountPaise });
  if (match !== 'MATCHED') throw new DomainError('RECONCILIATION_NOT_MATCHED', `Bill cannot be verified: ${match}.`, 409);
  const timestamp = now();
  const correlation = correlationId();
  await database.batch([
    database.prepare("UPDATE offline_bills SET status = 'VERIFIED', cloud_amount_paise = ?, verified_at = ?, verified_by = ? WHERE id = ? AND property_id = ?").bind(row.cloudAmountPaise, timestamp, actor.name, offlineBillId, PROPERTY_ID),
    auditStatement(database, actor, 'OFFLINE_BILL_VERIFIED', 'OFFLINE_BILL', offlineBillId, { status: row.status }, { status: 'VERIFIED', linkedOnly: true, financialReplay: false }, 'RECONCILIATION', correlation),
  ]);
  return { id: offlineBillId, status: 'VERIFIED', financialReplay: false };
}

async function updateHousekeeping(actor: Actor, taskId: string, expectedStatus: string, status: string, surfaceValue: string) {
  if (!['OWNER', 'MANAGER', 'HOUSEKEEPING'].includes(actor.role)) throw new DomainError('FORBIDDEN', 'This role cannot update housekeeping.', 403);
  requirePermission(actor, 'operations.write');
  const nextStatus: Record<string, string> = { DIRTY: 'ASSIGNED', ASSIGNED: 'CLEANING', CLEANING: 'READY_FOR_INSPECTION', READY_FOR_INSPECTION: 'CLEAN' };
  if (nextStatus[expectedStatus] !== status) throw new DomainError('INVALID_TRANSITION', 'Housekeeping stages must advance one step at a time.', 409);
  const connection = await propertyStatus();
  assertPropertyMutationAllowed(connection === 'ONLINE', surfaceValue === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  const database = env.DB;
  const row = await database.prepare('SELECT status, room_id AS roomId FROM housekeeping_tasks WHERE id = ? AND property_id = ?').bind(taskId, PROPERTY_ID).first<{ status: string; roomId: string }>();
  if (!row) throw new DomainError('NOT_FOUND', 'Housekeeping task not found.', 404);
  if (row.status !== expectedStatus) throw new DomainError('STALE_HOUSEKEEPING_TASK', `Room has already moved to ${row.status.replaceAll('_', ' ')}.`, 409);
  const timestamp = now();
  const correlation = correlationId();
  const statements = [database.prepare('UPDATE housekeeping_tasks SET status = ? WHERE id = ? AND property_id = ? AND status = ?').bind(status, taskId, PROPERTY_ID, expectedStatus)];
  if (status === 'CLEAN') statements.push(database.prepare("UPDATE rooms SET operational_status = 'CLEAN', version = version + 1, updated_at = ? WHERE id = ? AND property_id = ?").bind(timestamp, row.roomId, PROPERTY_ID));
  statements.push(auditStatement(database, actor, 'HOUSEKEEPING_STATUS_CHANGED', 'HOUSEKEEPING_TASK', taskId, { status: row.status }, { status }, 'CLOUD', correlation));
  const results = await database.batch(statements);
  if (Number(results[0].meta.changes ?? 0) !== 1) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'The housekeeping task changed before this update completed.', 409);
  return { taskId, roomId: row.roomId, previousStatus: row.status, status, updatedAt: timestamp, correlationId: correlation };
}

async function recordHousekeepingOutcome(actor: Actor, command: Record<string, unknown>) {
  if (!['OWNER', 'MANAGER', 'HOUSEKEEPING'].includes(actor.role)) throw new DomainError('FORBIDDEN', 'This role cannot update room service tasks.', 403);
  requirePermission(actor, 'operations.write');
  const connection = await propertyStatus();
  assertPropertyMutationAllowed(connection === 'ONLINE', String(command.surface ?? 'PROPERTY') === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  const taskId = String(command.taskId ?? '');
  const expectedVersion = Number(command.expectedVersion);
  const outcome = String(command.outcome ?? '').toUpperCase();
  if (!['DONE', 'GUEST_REFUSED', 'COME_LATER'].includes(outcome)) throw new DomainError('INVALID_HOUSEKEEPING_OUTCOME', 'Choose Done, Guest refused or Come later.', 400);
  const database = env.DB;
  const row = await database.prepare('SELECT id, room_id AS roomId, task_type AS taskType, status, outcome, scheduled_at AS scheduledAt, deferred_until AS deferredUntil, version FROM housekeeping_tasks WHERE id = ? AND property_id = ?').bind(taskId, PROPERTY_ID).first<Record<string, unknown>>();
  if (!row) throw new DomainError('NOT_FOUND', 'Housekeeping task not found.', 404);
  if (!['STAY_SERVICE', 'CHECKOUT_CLEANING'].includes(String(row.taskType))) throw new DomainError('INSPECTION_REQUIRED', 'Checkout inspections must be completed through room inspection.', 409);
  if (row.taskType === 'CHECKOUT_CLEANING' && outcome === 'GUEST_REFUSED') throw new DomainError('INVALID_HOUSEKEEPING_OUTCOME', 'Checkout cleaning cannot be closed as guest refused.', 409);
  if (Number(row.version) !== expectedVersion || ['COMPLETED', 'CANCELLED'].includes(String(row.status))) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This room task has already changed.', 409);
  const timestamp = now();
  const correlation = correlationId();
  let nextStatus = 'COMPLETED';
  let deferredUntil: string | null = null;
  if (outcome === 'COME_LATER') {
    deferredUntil = String(command.deferredUntil ?? '');
    if (!Number.isFinite(Date.parse(deferredUntil)) || Date.parse(deferredUntil) <= Date.now()) throw new DomainError('INVALID_DEFER_TIME', 'Choose a future time to return to the room.', 400);
    nextStatus = 'DEFERRED';
  }
  const statements: D1PreparedStatement[] = [
    database.prepare('UPDATE housekeeping_tasks SET status = ?, outcome = ?, scheduled_at = CASE WHEN ? IS NULL THEN scheduled_at ELSE ? END, deferred_until = ?, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND property_id = ? AND version = ?').bind(nextStatus, outcome, deferredUntil, deferredUntil, deferredUntil, nextStatus === 'COMPLETED' ? timestamp : null, timestamp, taskId, PROPERTY_ID, expectedVersion),
    auditStatement(database, actor, 'HOUSEKEEPING_OUTCOME_RECORDED', 'HOUSEKEEPING_TASK', taskId, row, { status: nextStatus, outcome, deferredUntil, version: expectedVersion + 1 }, 'CLOUD', correlation),
  ];
  if (outcome === 'DONE') statements.push(database.prepare("UPDATE rooms SET operational_status = 'CLEAN', version = version + 1, updated_at = ? WHERE id = ? AND property_id = ?").bind(timestamp, row.roomId, PROPERTY_ID));
  const results = await database.batch(statements);
  if (Number(results[0].meta.changes ?? 0) !== 1) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This room task changed before the update completed.', 409);
  return { taskId, roomId: row.roomId, status: nextStatus, outcome, deferredUntil, version: expectedVersion + 1 };
}

async function submitRoomInspection(actor: Actor, command: Record<string, unknown>) {
  if (!['OWNER', 'MANAGER', 'HOUSEKEEPING'].includes(actor.role)) throw new DomainError('FORBIDDEN', 'This role cannot submit room inspections.', 403);
  requirePermission(actor, 'operations.write');
  const connection = await propertyStatus();
  assertPropertyMutationAllowed(connection === 'ONLINE', String(command.surface ?? 'PROPERTY') === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  const taskId = String(command.taskId ?? '');
  const expectedVersion = Number(command.expectedVersion);
  const result = String(command.result ?? '').toUpperCase();
  if (!['NO_DAMAGE', 'DAMAGE_FOUND'].includes(result)) throw new DomainError('INVALID_INSPECTION_RESULT', 'Choose No damage or Damage found.', 400);
  const description = String(command.description ?? '').trim();
  const severity = normalizeDamageSeverity(command.severity ?? 'LOW');
  if (result === 'DAMAGE_FOUND' && description.length < 5) throw new DomainError('DAMAGE_DESCRIPTION_REQUIRED', 'Describe the damage before submitting the inspection.', 400);
  if (result === 'DAMAGE_FOUND' && description.length > 1_000) throw new DomainError('DAMAGE_DESCRIPTION_TOO_LONG', 'Damage description must be 1,000 characters or fewer.', 400);
  if (result === 'DAMAGE_FOUND' && !severity) throw new DomainError('INVALID_DAMAGE_SEVERITY', 'Damage severity must be Low, Medium or High.', 400);
  const database = env.DB;
  const row = await database.prepare(`SELECT h.id, h.room_id AS roomId, h.reservation_id AS reservationId, h.task_type AS taskType, h.status, h.version, f.id AS folioId, f.status AS folioStatus FROM housekeeping_tasks h JOIN reservations r ON r.id = h.reservation_id JOIN folios f ON f.reservation_id = r.id WHERE h.id = ? AND h.property_id = ?`).bind(taskId, PROPERTY_ID).first<Record<string, unknown>>();
  if (!row) throw new DomainError('NOT_FOUND', 'Checkout inspection task not found.', 404);
  if (row.taskType !== 'CHECKOUT_INSPECTION' || row.status !== 'NEEDS_INSPECTION') throw new DomainError('INVALID_INSPECTION_STATE', 'This room is not awaiting checkout inspection.', 409);
  if (row.folioStatus !== 'PENDING_INSPECTION') throw new DomainError('INVALID_FOLIO_STATE', 'This folio is no longer awaiting room inspection.', 409);
  if (Number(row.version) !== expectedVersion) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This inspection has already changed.', 409);
  const policy = result === 'DAMAGE_FOUND' ? await activeDamagePolicy(database, severity as DamageSeverity) : null;
  const timestamp = now();
  const inspectionId = crypto.randomUUID();
  const damageReportId = result === 'DAMAGE_FOUND' ? crypto.randomUUID() : null;
  const correlation = correlationId();
  const statements: D1PreparedStatement[] = [
    database.prepare('UPDATE housekeeping_tasks SET status = ?, outcome = ?, completed_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND property_id = ? AND version = ?').bind('COMPLETED', result, timestamp, timestamp, taskId, PROPERTY_ID, expectedVersion),
    database.prepare('INSERT INTO room_inspections (id, property_id, task_id, reservation_id, room_id, result, notes, damage_severity, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(inspectionId, PROPERTY_ID, taskId, row.reservationId, row.roomId, result, description || null, result === 'DAMAGE_FOUND' ? severity : null, actor.name, timestamp),
    database.prepare('UPDATE folios SET status = ?, version = version + 1, updated_at = ? WHERE id = ?').bind(result === 'DAMAGE_FOUND' ? 'PENDING_DAMAGE_REVIEW' : 'CLOSED', timestamp, row.folioId),
    auditStatement(database, actor, 'ROOM_INSPECTION_SUBMITTED', 'ROOM_INSPECTION', inspectionId, null, { taskId, reservationId: row.reservationId, roomId: row.roomId, result, severity: result === 'DAMAGE_FOUND' ? severity : null, damagePolicy: policy ? { id: policy.id, label: policy.label, liabilityPaise: policy.liabilityCapPaise } : null, financialMutation: false }, 'CLOUD', correlation),
  ];
  if (result === 'DAMAGE_FOUND') {
    statements.push(database.prepare("INSERT INTO damage_reports (id, property_id, inspection_id, reservation_id, room_id, folio_id, description, severity, status, policy_rule_id, policy_label, policy_liability_paise, repair_cost_paise, charge_amount_paise, folio_line_id, decision_note, reported_by, reported_at, reviewed_by, reviewed_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, 1)").bind(damageReportId, PROPERTY_ID, inspectionId, row.reservationId, row.roomId, row.folioId, description, severity, policy?.id, policy?.label, policy?.liabilityCapPaise, actor.name, timestamp));
    if (policy?.roomImpact === 'ROOM_OUT_OF_ORDER') {
      statements.push(database.prepare("UPDATE rooms SET operational_status = 'MAINTENANCE', version = version + 1, updated_at = ? WHERE id = ? AND property_id = ?").bind(timestamp, row.roomId, PROPERTY_ID));
    }
    if (policy?.roomImpact === 'ROOM_OUT_OF_ORDER' || policy?.roomImpact === 'MAINTENANCE_REVIEW') {
      statements.push(database.prepare("INSERT INTO maintenance_tickets (id, property_id, room_id, category, issue, severity, assigned_to, status, opened_at) VALUES (?, ?, ?, 'ROOM_DAMAGE', ?, 'HIGH', NULL, 'OPEN', ?)").bind(`damage-maint-${damageReportId}`, PROPERTY_ID, row.roomId, description, timestamp));
    }
  }
  if (result === 'NO_DAMAGE' || policy?.roomImpact !== 'ROOM_OUT_OF_ORDER') {
    statements.push(database.prepare("INSERT INTO housekeeping_tasks (id, property_id, room_id, reservation_id, assigned_to, task_type, priority, status, outcome, scheduled_at, deferred_until, completed_at, updated_at, version, notes) VALUES (?, ?, ?, ?, NULL, 'CHECKOUT_CLEANING', 'HIGH', 'ASSIGNED', NULL, ?, NULL, NULL, ?, 1, ?)").bind(crypto.randomUUID(), PROPERTY_ID, row.roomId, row.reservationId, timestamp, timestamp, 'Post-checkout cleaning'));
  }
  const results = await database.batch(statements);
  if (Number(results[0].meta.changes ?? 0) !== 1) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This inspection changed before submission completed.', 409);
  return {
    taskId,
    inspectionId,
    result,
    severity: result === 'DAMAGE_FOUND' ? severity : null,
    damageReportId,
    damagePolicy: policy ? { id: policy.id, label: policy.label, liabilityPaise: policy.liabilityCapPaise } : null,
    folioStatus: result === 'DAMAGE_FOUND' ? 'PENDING_DAMAGE_REVIEW' : 'CLOSED',
  };
}

async function resolveDamageReport(actor: Actor, command: Record<string, unknown>) {
  if (!['OWNER', 'MANAGER'].includes(actor.role)) throw new DomainError('FORBIDDEN', 'Only an owner or manager can resolve a damage report.', 403);
  requirePermission(actor, 'damage.review');
  const connection = await propertyStatus();
  assertPropertyMutationAllowed(connection === 'ONLINE', String(command.surface ?? 'PROPERTY') === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  const reportId = String(command.reportId ?? '');
  const expectedVersion = Number(command.expectedVersion);
  const decision = String(command.decision ?? '').toUpperCase();
  if (!['POST_CHARGE', 'WAIVE'].includes(decision)) throw new DomainError('INVALID_DAMAGE_DECISION', 'Choose Post charge or Waive.', 400);
  const repairCostInput = command.repairCostPaise ?? command.amountPaise;
  const repairCostPaise = repairCostInput == null || repairCostInput === '' ? null : Number(repairCostInput);
  if (repairCostPaise != null && (!Number.isSafeInteger(repairCostPaise) || repairCostPaise < 0)) throw new DomainError('INVALID_REPAIR_COST', 'Repair cost must be a non-negative whole amount in paise.', 400);
  const suppliedDecisionNote = String(command.decisionNote ?? '').trim();
  if (suppliedDecisionNote.length > 500) throw new DomainError('DAMAGE_DECISION_NOTE_TOO_LONG', 'Decision note must be 500 characters or fewer.', 400);
  const database = env.DB;
  const row = await database.prepare(`SELECT d.id, d.status, d.version, d.description, d.severity, d.policy_rule_id AS policyRuleId, d.policy_label AS policyLabel, d.policy_liability_paise AS policyLiabilityPaise, d.repair_cost_paise AS existingRepairCostPaise, d.charge_amount_paise AS existingChargeAmountPaise, d.folio_line_id AS existingFolioLineId, d.decision_note AS existingDecisionNote, d.reservation_id AS reservationId, d.folio_id AS folioId, f.status AS folioStatus, f.version AS folioVersion, f.subtotal_paise AS subtotalPaise, f.total_paise AS totalPaise, r.total_amount_paise AS reservationTotalPaise, r.balance_paise AS balancePaise FROM damage_reports d JOIN folios f ON f.id = d.folio_id JOIN reservations r ON r.id = d.reservation_id WHERE d.id = ? AND d.property_id = ?`).bind(reportId, PROPERTY_ID).first<Record<string, unknown>>();
  if (!row) throw new DomainError('NOT_FOUND', 'Damage report not found.', 404);
  const completedStatus = decision === 'POST_CHARGE' ? 'CHARGED' : 'WAIVED';
  if (row.status === completedStatus) {
    if (decision === 'POST_CHARGE' && repairCostPaise != null && Number(row.existingRepairCostPaise) !== repairCostPaise) throw new DomainError('DAMAGE_REVIEW_IDEMPOTENCY_CONFLICT', 'This damage report was already charged with a different repair cost.', 409);
    return { reportId, status: completedStatus, repairCostPaise: row.existingRepairCostPaise, policyLiabilityPaise: row.policyLiabilityPaise, amountPaise: row.existingChargeAmountPaise, decisionNote: row.existingDecisionNote, folioLineId: row.existingFolioLineId, idempotent: true };
  }
  if (row.status !== 'PENDING_REVIEW' || Number(row.version) !== expectedVersion) throw new DomainError('STALE_DAMAGE_REPORT', 'This damage report has already been reviewed.', 409);
  if (row.folioStatus !== 'PENDING_DAMAGE_REVIEW') throw new DomainError('INVALID_FOLIO_STATE', 'This folio is no longer awaiting damage review.', 409);
  const policyLiabilityPaise = Number(row.policyLiabilityPaise);
  const amountPaise = decision === 'POST_CHARGE'
    ? calculatePolicyDamageCharge(Number(repairCostPaise), policyLiabilityPaise)
    : null;
  const decisionNote = suppliedDecisionNote || (decision === 'POST_CHARGE'
    ? `Repair cost reviewed and capped by ${String(row.policyLabel)} policy.`
    : 'Guest charge waived after manager review.');
  const timestamp = now();
  const correlation = correlationId();
  const folioLineId = decision === 'POST_CHARGE' ? `damage-${reportId}` : null;
  const nextStatus = decision === 'POST_CHARGE' ? 'CHARGED' : 'WAIVED';
  const processingStatus = `PROCESSING_${decision}_${correlation}`;
  const claim = await database.prepare("UPDATE damage_reports SET status = ?, reviewed_by = ?, reviewed_at = ?, version = version + 1 WHERE id = ? AND property_id = ? AND status = 'PENDING_REVIEW' AND version = ?").bind(processingStatus, actor.name, timestamp, reportId, PROPERTY_ID, expectedVersion).run();
  if (Number(claim.meta.changes ?? 0) !== 1) throw new DomainError('STALE_DAMAGE_REPORT', 'This damage report has already been reviewed.', 409);
  const statements: D1PreparedStatement[] = [
    database.prepare('UPDATE damage_reports SET status = ?, repair_cost_paise = ?, charge_amount_paise = ?, folio_line_id = ?, decision_note = ?, version = version + 1 WHERE id = ? AND property_id = ? AND status = ? AND version = ?').bind(nextStatus, repairCostPaise, amountPaise, folioLineId, decisionNote, reportId, PROPERTY_ID, processingStatus, expectedVersion + 1),
    auditStatement(database, actor, decision === 'POST_CHARGE' ? 'DAMAGE_CHARGE_POSTED' : 'DAMAGE_CHARGE_WAIVED', 'DAMAGE_REPORT', reportId, row, { status: nextStatus, severity: row.severity, policyRuleId: row.policyRuleId, policyLabel: row.policyLabel, policyLiabilityPaise, repairCostPaise, amountPaise, decisionNote, folioLineId }, 'CLOUD', correlation),
  ];
  if (decision === 'POST_CHARGE') {
    statements.push(database.prepare("INSERT INTO folio_lines (id, folio_id, description, category, quantity, unit_amount_paise, tax_rate_bps, line_total_paise, source, created_at) VALUES (?, ?, ?, 'DAMAGE', 1, ?, 0, ?, 'INSPECTION_REVIEW', ?)").bind(folioLineId, row.folioId, `Room damage: ${String(row.description)}`, amountPaise, amountPaise, timestamp));
    statements.push(database.prepare("UPDATE folios SET status = 'CLOSED', subtotal_paise = subtotal_paise + ?, total_paise = total_paise + ?, version = version + 1, updated_at = ? WHERE id = ?").bind(amountPaise, amountPaise, timestamp, row.folioId));
    statements.push(database.prepare('UPDATE reservations SET total_amount_paise = total_amount_paise + ?, balance_paise = balance_paise + ?, version = version + 1, updated_at = ? WHERE id = ?').bind(amountPaise, amountPaise, timestamp, row.reservationId));
  } else {
    statements.push(database.prepare("UPDATE folios SET status = 'CLOSED', version = version + 1, updated_at = ? WHERE id = ?").bind(timestamp, row.folioId));
  }
  try {
    const results = await database.batch(statements);
    if (Number(results[0].meta.changes ?? 0) !== 1) throw new DomainError('STALE_DAMAGE_REPORT', 'This damage report changed before review completed.', 409);
  } catch (error) {
    await database.prepare("UPDATE damage_reports SET status = 'PENDING_REVIEW', reviewed_by = NULL, reviewed_at = NULL, version = ? WHERE id = ? AND property_id = ? AND status = ? AND version = ?").bind(expectedVersion, reportId, PROPERTY_ID, processingStatus, expectedVersion + 1).run();
    throw error;
  }
  return { reportId, status: nextStatus, repairCostPaise, policyLiabilityPaise, amountPaise, decisionNote, folioLineId };
}

async function upsertInventory(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'inventory.write');
  const connection = await propertyStatus();
  assertPropertyMutationAllowed(connection === 'ONLINE', String(command.surface ?? 'PROPERTY') === 'MASTER_HUB' ? 'MASTER_HUB' : 'PROPERTY');
  const id = String(command.id ?? '').trim();
  const name = String(command.name ?? '').trim();
  const category = String(command.category ?? '').trim();
  const requestedDepartment = String(command.department ?? 'HOTEL').toUpperCase();
  const department = actor.role === 'RESTAURANT' ? 'RESTAURANT' : requestedDepartment;
  const unit = String(command.unit ?? '').trim();
  const currentQuantity = Number(command.currentQuantity);
  const minimumQuantity = Number(command.minimumQuantity);
  const unitCostPaise = Number(command.unitCostPaise);
  if ([name, category, unit].some((value) => value.length < 1)) throw new DomainError('INVALID_INVENTORY_ITEM', 'Name, category and unit are required.', 400);
  if (actor.role === 'RESTAURANT' && !['Kitchen', 'Beverage', 'Restaurant Supplies'].includes(category)) throw new DomainError('INVALID_RESTAURANT_CATEGORY', 'Restaurant inventory must use Kitchen, Beverage or Restaurant Supplies.', 400);
  if (!['HOTEL', 'RESTAURANT'].includes(department)) throw new DomainError('INVALID_INVENTORY_DEPARTMENT', 'Inventory department must be Hotel or Restaurant.', 400);
  if (![currentQuantity, minimumQuantity, unitCostPaise].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new DomainError('INVALID_INVENTORY_AMOUNT', 'Stock levels and unit cost must be non-negative whole numbers.', 400);
  const database = env.DB;
  const existing = id ? await database.prepare('SELECT id, name, category, department, unit, current_quantity AS currentQuantity, minimum_quantity AS minimumQuantity, unit_cost_paise AS unitCostPaise, updated_at AS updatedAt FROM inventory_items WHERE id = ? AND property_id = ?').bind(id, PROPERTY_ID).first<Record<string, unknown>>() : null;
  if (id && !existing) throw new DomainError('NOT_FOUND', 'Inventory item not found.', 404);
  if (actor.role === 'RESTAURANT' && existing && existing.department !== 'RESTAURANT') throw new DomainError('FORBIDDEN_INVENTORY_SCOPE', 'Restaurant staff can update restaurant inventory only.', 403);
  if (existing && String(command.expectedUpdatedAt ?? '') !== String(existing.updatedAt)) throw new DomainError('STALE_INVENTORY_ITEM', 'This inventory item was updated by someone else. Refresh and try again.', 409);
  const itemId = existing ? String(existing.id) : crypto.randomUUID();
  const previousTimestamp = existing ? Date.parse(String(existing.updatedAt)) : 0;
  const timestamp = new Date(Math.max(Date.now(), previousTimestamp + 1)).toISOString();
  const next = { id: itemId, name, category, department, unit, currentQuantity, minimumQuantity, unitCostPaise, updatedAt: timestamp };
  const correlation = correlationId();
  if (existing) {
    const changedFields = ['name', 'category', 'department', 'unit', 'currentQuantity', 'minimumQuantity', 'unitCostPaise'].filter((field) => String(existing[field]) !== String(next[field as keyof typeof next]));
    if (!changedFields.length) return { item: existing, changedFields: [], noOp: true };
    const results = await database.batch([
      database.prepare('UPDATE inventory_items SET name = ?, category = ?, department = ?, unit = ?, current_quantity = ?, minimum_quantity = ?, unit_cost_paise = ?, updated_at = ? WHERE id = ? AND property_id = ? AND updated_at = ?').bind(name, category, department, unit, currentQuantity, minimumQuantity, unitCostPaise, timestamp, itemId, PROPERTY_ID, existing.updatedAt),
      auditStatement(database, actor, 'INVENTORY_ITEM_UPDATED', 'INVENTORY_ITEM', itemId, existing, next, 'CLOUD', correlation),
    ]);
    if (Number(results[0].meta.changes ?? 0) !== 1) throw new DomainError('STALE_INVENTORY_ITEM', 'This inventory item was updated by someone else. Refresh and try again.', 409);
    return { item: next, changedFields, correlationId: correlation };
  }
  await database.batch([
    database.prepare('INSERT INTO inventory_items (id, property_id, name, category, department, unit, current_quantity, minimum_quantity, unit_cost_paise, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(itemId, PROPERTY_ID, name, category, department, unit, currentQuantity, minimumQuantity, unitCostPaise, timestamp),
    auditStatement(database, actor, 'INVENTORY_ITEM_CREATED', 'INVENTORY_ITEM', itemId, null, next, 'CLOUD', correlation),
  ]);
  return { item: next, changedFields: ['name', 'category', 'department', 'unit', 'currentQuantity', 'minimumQuantity', 'unitCostPaise'], correlationId: correlation };
}

async function createCustomPackage(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'travel.package.create');
  const clientName = String(command.clientName ?? '').trim();
  const name = String(command.name ?? '').trim();
  const rawSelections = Array.isArray(command.assetSelections) ? command.assetSelections : [];
  if (clientName.length < 2 || name.length < 3) throw new DomainError('INVALID_PACKAGE', 'Client and package names are required.', 400);
  const quantities = new Map<string, number>();
  rawSelections.forEach((value) => {
    const item = value as Record<string, unknown>;
    const assetId = String(item.assetId ?? '');
    const quantity = Number(item.quantity);
    if (!assetId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new DomainError('INVALID_PACKAGE_ASSET', 'Every selected asset needs a quantity from 1 to 99.', 400);
    quantities.set(assetId, (quantities.get(assetId) ?? 0) + quantity);
  });
  const assetIds = [...quantities.keys()];
  if (!assetIds.length) throw new DomainError('PACKAGE_ASSETS_REQUIRED', 'Select at least one available travel asset.', 400);
  const database = env.DB;
  const placeholders = assetIds.map(() => '?').join(',');
  const result = await database.prepare(`SELECT id, name, category, pricing_unit AS pricingUnit, unit_price_paise AS unitPricePaise FROM travel_assets WHERE organisation_id = ? AND active = 1 AND id IN (${placeholders})`).bind(ORGANISATION_ID, ...assetIds).all<Record<string, unknown>>();
  if (result.results.length !== assetIds.length) throw new DomainError('PACKAGE_ASSET_UNAVAILABLE', 'One or more selected assets are unavailable.', 409);
  const assetRows = result.results as Array<{ id: string; name: string; category: string; pricingUnit: string; unitPricePaise: number }>;
  const items = assetRows.map((asset) => {
    const quantity = quantities.get(String(asset.id)) ?? 0;
    return { ...asset, quantity, lineTotalPaise: Number(asset.unitPricePaise) * quantity };
  });
  const assetSubtotalPaise = items.reduce((sum, item) => sum + Number(item.lineTotalPaise), 0);
  const canManagePricing = roleCan(actor.role, 'travel.pricing.manage');
  const requestedBase = Number(command.basePricePaise);
  const requestedFloor = Number(command.floorPricePaise);
  const basePricePaise = canManagePricing && Number.isSafeInteger(requestedBase) && requestedBase > 0 ? requestedBase : assetSubtotalPaise;
  const floorPricePaise = canManagePricing && Number.isSafeInteger(requestedFloor) && requestedFloor >= 0 ? requestedFloor : Math.round(basePricePaise * 0.9);
  const quotedPricePaise = Number(command.quotedPricePaise || basePricePaise);
  if (![basePricePaise, floorPricePaise, quotedPricePaise].every((value) => Number.isSafeInteger(value) && value >= 0) || floorPricePaise > basePricePaise || quotedPricePaise < 1) throw new DomainError('INVALID_PACKAGE_PRICING', 'Pricing must use whole paise and the floor cannot exceed the base price.', 400);
  const belowFloor = quotedPricePaise < floorPricePaise;
  const reason = String(command.discountReason ?? '').trim();
  if (belowFloor && !canManagePricing && reason.length < 5) throw new DomainError('DISCOUNT_REASON_REQUIRED', 'A reason is required for a quote below the manager floor.', 400);
  const packageId = crypto.randomUUID();
  const reference = `PKG-${String(Date.now()).slice(-6)}-${crypto.randomUUID().slice(0, 3).toUpperCase()}`;
  const timestamp = now();
  const status = belowFloor && !canManagePricing ? 'DISCOUNT_REQUESTED' : 'READY_TO_SEND';
  const correlation = correlationId();
  const statements: D1PreparedStatement[] = [
    database.prepare('INSERT INTO custom_travel_packages (id, organisation_id, reference, client_name, name, owner_id, owner_name, asset_subtotal_paise, base_price_paise, floor_price_paise, quoted_price_paise, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)').bind(packageId, ORGANISATION_ID, reference, clientName, name, actor.id, actor.name, assetSubtotalPaise, basePricePaise, floorPricePaise, quotedPricePaise, status, timestamp, timestamp),
    ...items.map((item) => database.prepare('INSERT INTO custom_travel_package_items (id, package_id, asset_id, asset_name, category, pricing_unit, quantity, unit_price_paise, line_total_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), packageId, item.id, item.name, item.category, item.pricingUnit, item.quantity, item.unitPricePaise, item.lineTotalPaise)),
    auditStatement(database, actor, 'CUSTOM_PACKAGE_CREATED', 'CUSTOM_TRAVEL_PACKAGE', packageId, null, { reference, clientName, name, assetSubtotalPaise, basePricePaise, floorPricePaise, quotedPricePaise, status }, 'CLOUD', correlation),
  ];
  let discountRequestId: string | null = null;
  if (belowFloor && !canManagePricing) {
    discountRequestId = crypto.randomUUID();
    statements.push(database.prepare('INSERT INTO travel_discount_requests (id, organisation_id, package_id, package_version, requested_by_id, requested_by_name, requested_price_paise, base_price_paise, floor_price_paise, reason, status, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)').bind(discountRequestId, ORGANISATION_ID, packageId, actor.id, actor.name, quotedPricePaise, basePricePaise, floorPricePaise, reason, 'PENDING', timestamp));
    statements.push(auditStatement(database, actor, 'PACKAGE_DISCOUNT_REQUESTED', 'TRAVEL_DISCOUNT_REQUEST', discountRequestId, null, { packageId, requestedPricePaise: quotedPricePaise, floorPricePaise, reason }, 'CLOUD', correlation));
  }
  await database.batch(statements);
  return { packageId, reference, status, assetSubtotalPaise, basePricePaise, floorPricePaise, quotedPricePaise, discountRequestId };
}

async function setPackagePricing(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'travel.pricing.manage');
  const packageId = String(command.packageId ?? '');
  const basePricePaise = Number(command.basePricePaise);
  const floorPricePaise = Number(command.floorPricePaise);
  if (![basePricePaise, floorPricePaise].every((value) => Number.isSafeInteger(value) && value >= 0) || floorPricePaise > basePricePaise) throw new DomainError('INVALID_PACKAGE_PRICING', 'Floor price must be between zero and the base price.', 400);
  const database = env.DB;
  const previous = await database.prepare('SELECT id, base_price_paise AS basePricePaise, floor_price_paise AS floorPricePaise, quoted_price_paise AS quotedPricePaise, status, version FROM custom_travel_packages WHERE id = ? AND organisation_id = ?').bind(packageId, ORGANISATION_ID).first<Record<string, unknown>>();
  if (!previous) throw new DomainError('NOT_FOUND', 'Custom package not found.', 404);
  const version = Number(previous.version) + 1;
  const status = Number(previous.quotedPricePaise) < floorPricePaise ? 'NEEDS_REPRICE' : 'READY_TO_SEND';
  const timestamp = now();
  const correlation = correlationId();
  await database.batch([
    database.prepare('UPDATE custom_travel_packages SET base_price_paise = ?, floor_price_paise = ?, status = ?, version = ?, updated_at = ? WHERE id = ? AND organisation_id = ?').bind(basePricePaise, floorPricePaise, status, version, timestamp, packageId, ORGANISATION_ID),
    database.prepare("UPDATE travel_discount_requests SET status = 'STALE', decided_at = ? WHERE package_id = ? AND status = 'PENDING'").bind(timestamp, packageId),
    auditStatement(database, actor, 'PACKAGE_PRICING_SET', 'CUSTOM_TRAVEL_PACKAGE', packageId, previous, { basePricePaise, floorPricePaise, status, version }, 'CLOUD', correlation),
  ]);
  return { packageId, basePricePaise, floorPricePaise, status, version };
}

async function resolveDiscountRequest(actor: Actor, command: Record<string, unknown>) {
  requirePermission(actor, 'travel.discount.approve');
  const requestId = String(command.requestId ?? '');
  const decision = String(command.decision ?? '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new DomainError('INVALID_DECISION', 'Choose approve or reject.', 400);
  const database = env.DB;
  const request = await database.prepare(`SELECT d.id, d.package_id AS packageId, d.package_version AS packageVersion, d.requested_by_id AS requestedById, d.requested_price_paise AS requestedPricePaise, d.status, p.version AS currentVersion FROM travel_discount_requests d JOIN custom_travel_packages p ON p.id = d.package_id WHERE d.id = ? AND d.organisation_id = ?`).bind(requestId, ORGANISATION_ID).first<Record<string, unknown>>();
  if (!request) throw new DomainError('NOT_FOUND', 'Discount request not found.', 404);
  if (request.status !== 'PENDING') throw new DomainError('DISCOUNT_ALREADY_RESOLVED', 'This discount request has already been resolved.', 409);
  if (String(request.requestedById) === actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 'The requester cannot approve their own discount.', 403);
  if (Number(request.packageVersion) !== Number(request.currentVersion)) throw new DomainError('STALE_DISCOUNT_REQUEST', 'Package pricing changed after this request. Ask sales to submit a new quote.', 409);
  const timestamp = now();
  const packageStatus = decision === 'APPROVED' ? 'READY_TO_SEND' : 'NEEDS_REPRICE';
  const note = String(command.decisionNote ?? '').trim();
  const correlation = correlationId();
  const packageUpdate = decision === 'APPROVED'
    ? database.prepare('UPDATE custom_travel_packages SET quoted_price_paise = ?, status = ?, updated_at = ? WHERE id = ? AND organisation_id = ?').bind(request.requestedPricePaise, packageStatus, timestamp, request.packageId, ORGANISATION_ID)
    : database.prepare('UPDATE custom_travel_packages SET status = ?, updated_at = ? WHERE id = ? AND organisation_id = ?').bind(packageStatus, timestamp, request.packageId, ORGANISATION_ID);
  await database.batch([
    database.prepare('UPDATE travel_discount_requests SET status = ?, reviewed_by_id = ?, reviewed_by_name = ?, decision_note = ?, decided_at = ? WHERE id = ? AND status = ?').bind(decision, actor.id, actor.name, note || null, timestamp, requestId, 'PENDING'),
    packageUpdate,
    auditStatement(database, actor, `PACKAGE_DISCOUNT_${decision}`, 'TRAVEL_DISCOUNT_REQUEST', requestId, { status: request.status }, { status: decision, packageStatus, decisionNote: note || null }, 'CLOUD', correlation),
  ]);
  return { requestId, packageId: request.packageId, status: decision, packageStatus };
}
