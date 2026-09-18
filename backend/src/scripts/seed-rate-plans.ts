import { eq } from 'drizzle-orm';

import { getDb, getPostgresClient } from '@/db';
import { ratePlans, rooms } from '@/db/schema';

const db = getDb();
const timestamp = new Date().toISOString();

const roomRows = await db
  .select()
  .from(rooms)
  .where(eq(rooms.active, true));

if (!roomRows.length) {
  console.log(
    JSON.stringify({
      seeded: false,
      reason: 'No active rooms found.',
    }),
  );

  await getPostgresClient().end();
  process.exit(0);
}

const propertyGroups = new Map<
  string,
  Map<string, number>
>();

for (const room of roomRows) {
  const roomTypes =
    propertyGroups.get(room.propertyId) ??
    new Map<string, number>();

  const currentRate = roomTypes.get(room.roomType);

  if (
    currentRate === undefined ||
    room.baseRateRupees < currentRate
  ) {
    roomTypes.set(
      room.roomType,
      room.baseRateRupees,
    );
  }

  propertyGroups.set(
    room.propertyId,
    roomTypes,
  );
}

function codePart(roomType: string) {
  return roomType
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18);
}

let inserted = 0;

for (const [propertyId, roomTypes] of propertyGroups) {
  for (const [roomType, baseRateRupees] of roomTypes) {
    const prefix = codePart(roomType);

    const samples = [
      {
        code: `${prefix}-BAR`,
        name: 'Best Available Rate',
        rateRupees: baseRateRupees,
        mealPlan: 'EP',
        refundable: true,
        minStay: 1,
      },
      {
        code: `${prefix}-CORP`,
        name: 'Corporate Rate',
        rateRupees: Math.round(
          baseRateRupees * 0.9,
        ),
        mealPlan: 'EP',
        refundable: true,
        minStay: 1,
      },
      {
        code: `${prefix}-ADV`,
        name: 'Advance Purchase',
        rateRupees: Math.round(
          baseRateRupees * 0.85,
        ),
        mealPlan: 'EP',
        refundable: false,
        minStay: 2,
      },
    ];

    for (const sample of samples) {
      const result = await db
        .insert(ratePlans)
        .values({
          id: crypto.randomUUID(),
          propertyId,
          code: sample.code,
          name: sample.name,
          roomType,

          rateRupees: sample.rateRupees,

          mealPlan: sample.mealPlan,
          refundable: sample.refundable,
          minStay: sample.minStay,
          validFrom: null,
          validTo: null,
          active: true,
          version: 1,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({
          id: ratePlans.id,
        });

      inserted += result.length;
    }
  }
}

console.log(
  JSON.stringify(
    {
      seeded: true,
      inserted,
      message:
        inserted === 0
          ? 'Sample rate plans already exist.'
          : `${inserted} sample rate plans created.`,
    },
    null,
    2,
  ),
);

await getPostgresClient().end();