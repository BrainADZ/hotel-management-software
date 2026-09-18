import { appUsers, organisations, properties, rooms } from '@/db/schema';
import { getDb, getPostgresClient } from '@/db';
import { hashPassword } from '@/services/auth/local-session';

if (process.env.APP_MODE !== 'production' || process.env.LOCAL_AUTH_ENABLED !== 'true') throw new Error('Local production seed requires APP_MODE=production and LOCAL_AUTH_ENABLED=true.');
const email = 'web@brainadz.marketing';
const password = 'admin@HMS';

const db = getDb(), timestamp = new Date().toISOString();
const organisationId = 'org-local-hotel', propertyId = 'property-local-hotel', userId = 'user-local-owner';
await db.insert(organisations).values({ id: organisationId, name: 'Local Hotel Organisation', active: true, createdAt: timestamp, updatedAt: timestamp })
  .onConflictDoUpdate({ target: organisations.id, set: { name: 'Local Hotel Organisation', active: true, updatedAt: timestamp } });
await db.insert(properties).values({ id: propertyId, organisationId, code: 'LOCAL', name: 'BrainADZ Local Hotel', city: 'Nagpur', timezone: 'Asia/Kolkata', checkInTime: '00:00', checkOutTime: '23:59', kycRequired: false, active: true, updatedAt: timestamp, connectionStatus: 'ONLINE', lastSyncAt: timestamp, version: 1, legalName: 'BrainADZ Local Hotel', billingAddress: 'Nagpur, Maharashtra', billingState: 'Maharashtra', billingStateCode: '27', invoicePrefix: 'BLH-INV', receiptPrefix: 'BLH-RCT', defaultTaxRateBps: 1800, defaultTaxMode: 'CGST_SGST' })
  .onConflictDoUpdate({ target: properties.id, set: { active: true, updatedAt: timestamp, lastSyncAt: timestamp } });
const passwordHash = await hashPassword(password);
await db.insert(appUsers).values({ id: userId, organisationId, propertyId, name: 'BrainADZ Demo Owner', displayName: 'BrainADZ Demo Owner', email, authProvider: 'local-session', authSubject: email, passwordHash, role: 'OWNER', active: true, createdAt: timestamp, updatedAt: timestamp })
  .onConflictDoUpdate({ target: appUsers.id, set: { name: 'BrainADZ Demo Owner', displayName: 'BrainADZ Demo Owner', email, authProvider: 'local-session', authSubject: email, passwordHash, role: 'OWNER', active: true, propertyId, updatedAt: timestamp } });
for (let index = 1; index <= 8; index += 1) {
  const number = String(100 + index), roomType = index <= 4 ? 'Deluxe' : index <= 7 ? 'Executive' : 'Suite';
  await db.insert(rooms).values({ id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`, propertyId, number, floor: 1, roomType, baseRateRupees: roomType === 'Deluxe' ? 4500 : roomType === 'Executive' ? 6500 : 9000, occupancyStatus: 'VACANT', operationalStatus: 'CLEAN', active: true, version: 1, updatedAt: timestamp })
    .onConflictDoNothing();
}
console.log(JSON.stringify({ seeded: true, organisationId, propertyId, userId, email, rooms: 8 }));
await getPostgresClient().end();
