import { appUsers, organisations, properties, rooms } from '@/db/schema';
import { getDb, getPostgresClient } from '@/db';
import { hashPassword } from '@/services/auth/local-session';

if (
  process.env.APP_MODE !== 'production' ||
  process.env.LOCAL_AUTH_ENABLED !== 'true'
) {
  throw new Error(
    'Local production seed requires APP_MODE=production and LOCAL_AUTH_ENABLED=true.',
  );
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for local production seed.');
}

const databaseHost = new URL(databaseUrl).hostname;

if (!['localhost', '127.0.0.1'].includes(databaseHost)) {
  throw new Error(
    'Local production seed can only run against a localhost database.',
  );
}

const email =
  process.env.LOCAL_SEED_OWNER_EMAIL?.trim() ||
  'web@brainadz.marketing';

const password = process.env.LOCAL_SEED_OWNER_PASSWORD;

if (!password || password.length < 8) {
  throw new Error(
    'LOCAL_SEED_OWNER_PASSWORD must be configured with at least 8 characters.',
  );
}

const db = getDb();
const timestamp = new Date().toISOString();

const businessDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const organisationId = 'org-local-hotel';
const propertyId = 'property-local-hotel';
const userId = 'user-local-owner';

await db
  .insert(organisations)
  .values({
    id: organisationId,
    name: 'Local Hotel Organisation',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .onConflictDoUpdate({
    target: organisations.id,
    set: {
      name: 'Local Hotel Organisation',
      active: true,
      updatedAt: timestamp,
    },
  });

await db
  .insert(properties)
  .values({
    id: propertyId,
    organisationId,
    code: 'LOCAL',
    name: 'BrainADZ Local Hotel',
    city: 'Nagpur',
    timezone: 'Asia/Kolkata',
    businessDate,
    checkInTime: '00:00',
    checkOutTime: '23:59',
    kycRequired: false,
    active: true,
    updatedAt: timestamp,
    connectionStatus: 'ONLINE',
    lastSyncAt: timestamp,
    version: 1,
    legalName: 'BrainADZ Local Hotel',
    billingAddress: 'Nagpur, Maharashtra',
    billingState: 'Maharashtra',
    billingStateCode: '27',
    invoicePrefix: 'BLH-INV',
    receiptPrefix: 'BLH-RCT',
    defaultTaxRateBps: 1800,
    defaultTaxMode: 'CGST_SGST',
  })
  .onConflictDoUpdate({
    target: properties.id,
    set: {
      active: true,
      updatedAt: timestamp,
      lastSyncAt: timestamp,
    },
  });

const passwordHash = await hashPassword(password);

await db
  .insert(appUsers)
  .values({
    id: userId,
    organisationId,
    propertyId,
    name: 'BrainADZ Demo Owner',
    displayName: 'BrainADZ Demo Owner',
    email,
    authProvider: 'local-session',
    authSubject: email,
    passwordHash,
    role: 'OWNER',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .onConflictDoUpdate({
    target: appUsers.id,
    set: {
      name: 'BrainADZ Demo Owner',
      displayName: 'BrainADZ Demo Owner',
      email,
      authProvider: 'local-session',
      authSubject: email,
      passwordHash,
      role: 'OWNER',
      active: true,
      propertyId,
      updatedAt: timestamp,
    },
  });

for (let index = 1; index <= 8; index += 1) {
  const number = String(100 + index);

  const roomType =
    index <= 4
      ? 'Deluxe'
      : index <= 7
        ? 'Executive'
        : 'Suite';

  const baseRateRupees =
    roomType === 'Deluxe'
      ? 4500
      : roomType === 'Executive'
        ? 6500
        : 9000;

  await db
    .insert(rooms)
    .values({
      id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
      propertyId,
      number,
      floor: 1,
      roomType,
      baseRateRupees,
      occupancyStatus: 'VACANT',
      operationalStatus: 'CLEAN',
      active: true,
      version: 1,
      updatedAt: timestamp,
    })
    .onConflictDoNothing();
}

console.log(
  JSON.stringify({
    seeded: true,
    organisationId,
    propertyId,
    userId,
    email,
    rooms: 8,
  }),
);

await getPostgresClient().end();