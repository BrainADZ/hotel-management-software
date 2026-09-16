import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  assertRoleCan,
  DomainError,
  isAppRole,
  operatingMetrics,
  roleCan,
} from '@hotel/shared/domain';
import { getDb } from '@/db';
import {
  appUsers,
  auditLogs,
  folioLines,
  folios,
  housekeepingTasks,
  inventoryItems,
  invoices,
  maintenanceTickets,
  offlineBills,
  properties,
  reservations,
  restaurantMealBookings,
  restaurantOrderItems,
  restaurantOrders,
  rooms,
  userSessions,
} from '@/db/schema';
import {
  inventoryMovements,
  lostFound,
  menuItems,
} from '@/db/operational-schema';
import { calculateLine } from '@/modules/billing/calculations';
import {
  normalizeRestaurantGstProfile,
  restaurantServiceGstRateBps,
  type RestaurantGstProfile,
} from '@/modules/billing/india-gst';
import { hashPassword } from '@/services/auth/local-session';
import type { ReservationContext } from '@/services/reservations/types';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const id = z.string().trim().min(1).max(120);
const label = z.string().trim().min(2).max(200);
const version = z.number().int().positive();

export const workflowSchemas = {
  SAVE_MENU_ITEM: z.object({
    id: id.optional(),
    expectedVersion: version.optional(),
    name: label,
    category: label,
    pricePaise: z.number().int().positive().max(100_000_000),
    available: z.boolean(),
  }),
  RECORD_LOST_ITEM: z.object({
    description: label,
    location: label,
    custody: label,
  }),
  RELEASE_LOST_ITEM: z.object({
    id,
    expectedVersion: version,
    custody: label,
  }),
  MOVE_STOCK: z.object({
    itemId: id,
    delta: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((value) => value !== 0),
    reason: label,
    expectedUpdatedAt: z.string().min(1),
  }),
  SAVE_ROOM: z.object({
    id: id.optional(),
    expectedVersion: version.optional(),
    number: z.string().trim().min(1).max(30),
    roomType: label,
    floor: z.number().int().min(0).max(200),
    baseRatePaise: z.number().int().nonnegative().max(100_000_000),
  }),
  CREATE_HOUSEKEEPING_TASK: z.object({
    roomId: id,
    taskType: z.enum(['STAY_SERVICE', 'CHECKOUT_CLEANING']),
    priority: z.enum(['NORMAL', 'HIGH']),
    notes: z.string().max(1000).default(''),
  }),
  CREATE_RESTAURANT_ORDER: z
    .object({
      clientOperationId: z.string().uuid(),
      reservationId: id.optional(),
      menuItemId: id.optional(),
      quantity: z.number().int().positive().max(100).optional(),
      items: z
        .array(
          z.object({
            menuItemId: id,
            quantity: z.number().int().positive().max(100),
          }),
        )
        .min(1)
        .max(50)
        .optional(),
      orderType: z.enum(['RESTAURANT', 'ROOM_SERVICE']),
      tableNumber: z.string().trim().min(1).max(30).optional(),
      covers: z.number().int().min(1).max(100).optional(),
      waiterUserId: id.optional(),
      specialInstructions: z.string().trim().max(500).optional(),
    })
    .superRefine((value, ctx) => {
      if (
        (!value.items || value.items.length === 0) &&
        (!value.menuItemId || !value.quantity)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Add at least one menu item to the order.',
          path: ['items'],
        });
      }

      if (value.orderType === 'ROOM_SERVICE' && !value.reservationId) {
        ctx.addIssue({
          code: 'custom',
          message: 'Choose a checked-in stay for room service.',
          path: ['reservationId'],
        });
      }

      if (value.orderType === 'RESTAURANT') {
        if (!value.tableNumber) {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter a table number for dine-in service.',
            path: ['tableNumber'],
          });
        }

        if (!value.covers) {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter the number of covers for dine-in service.',
            path: ['covers'],
          });
        }

        if (!value.waiterUserId) {
          ctx.addIssue({
            code: 'custom',
            message: 'Assign a waiter for dine-in service.',
            path: ['waiterUserId'],
          });
        }
      }
    }),
  UPDATE_RESTAURANT_ORDER: z.object({
    id,
    expectedVersion: version,
    status: z.enum(['PREPARING', 'READY', 'DELIVERED']),
  }),
  SAVE_STAFF: z.object({
    id: id.optional(),
    expectedUpdatedAt: z.string().nullable().optional(),
    name: label,
    email: z.email(),
    role: z.string().refine(isAppRole),
    active: z.boolean(),
    password: z.string().min(8).max(200).optional(),
  }),
  SAVE_PROPERTY: z.object({
    name: label,
    city: label,
    expectedVersion: version,
    checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    defaultTaxRateBps: z.number().int().min(0).max(10000),
    restaurantGstProfile: z
      .enum([
        'UNCONFIGURED',
        'STANDARD_5_NO_ITC',
        'SPECIFIED_18_WITH_ITC',
      ])
      .optional(),
  }),
  BOOK_MEAL: z.object({
    reservationId: id,
    serviceDate: z.iso.date(),
    mealPeriod: z.enum([
      'BREAKFAST',
      'BRUNCH',
      'LUNCH',
      'HIGH_TEA',
      'DINNER',
      'SUPPER',
    ]),
    guestCount: z.number().int().min(1).max(100),
    dietaryNotes: z.string().max(500).default(''),
  }),
  SERVE_MEAL: z.object({ id }),
};

export type WorkflowAction = keyof typeof workflowSchemas;

export function isWorkflowAction(action: string): action is WorkflowAction {
  return Object.hasOwn(workflowSchemas, action);
}

function conflict() {
  return new DomainError(
    'STALE_RECORD',
    'This record changed. Refresh before trying again.',
    409,
  );
}

export function restaurantFolioLineSourceId(
  orderId: string,
  menuItemId: string,
) {
  return `${orderId}:${menuItemId}`;
}

export function restaurantGstRateBps(profile: string) {
  return restaurantServiceGstRateBps(profile as RestaurantGstProfile);
}

async function audit(
  tx: Tx,
  c: ReservationContext,
  action: string,
  entityId: string,
  details: unknown,
) {
  await tx.insert(auditLogs).values({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actorId: c.actor.id,
    actorName: c.actor.name,
    role: c.actor.role,
    propertyId: c.property.id,
    action,
    entity: 'OPERATIONS',
    entityId,
    newValue: JSON.stringify(details),
    source: 'PRODUCTION_API',
    correlationId: crypto.randomUUID(),
  });
}

async function roomFor(
  tx: Tx,
  c: ReservationContext,
  roomId: string,
) {
  const [room] = await tx
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.id, roomId),
        eq(rooms.propertyId, c.property.id),
      ),
    )
    .for('update');

  if (!room) {
    throw new DomainError(
      'ROOM_NOT_FOUND',
      'Room not found in this property.',
      404,
    );
  }

  return room;
}

export async function operationalSnapshot(c: ReservationContext) {
  const db = getDb();

  const [
    menu,
    lost,
    stock,
    staff,
    profile,
    serviceStays,
    restaurantStaff,
    invoiceRows,
    billRows,
    restaurantItemRows,
  ] = await Promise.all([
    roleCan(c.actor.role, 'restaurant.manage')
      ? db
          .select()
          .from(menuItems)
          .where(eq(menuItems.propertyId, c.property.id))
      : [],
    roleCan(c.actor.role, 'lostfound.manage')
      ? db
          .select()
          .from(lostFound)
          .where(eq(lostFound.propertyId, c.property.id))
          .orderBy(desc(lostFound.createdAt))
          .limit(500)
      : [],
    roleCan(c.actor.role, 'inventory.write')
      ? db
          .select({
            id: inventoryMovements.id,
            itemName: inventoryItems.name,
            delta: inventoryMovements.delta,
            balance: inventoryMovements.balance,
            reason: inventoryMovements.reason,
            actorName: inventoryMovements.actorName,
            createdAt: inventoryMovements.createdAt,
          })
          .from(inventoryMovements)
          .innerJoin(
            inventoryItems,
            eq(inventoryItems.id, inventoryMovements.itemId),
          )
          .where(
            and(
              eq(inventoryMovements.propertyId, c.property.id),
              c.actor.role === 'RESTAURANT'
                ? eq(inventoryItems.department, 'RESTAURANT')
                : undefined,
            ),
          )
          .orderBy(desc(inventoryMovements.createdAt))
          .limit(500)
      : [],
    roleCan(c.actor.role, 'staff.manage')
      ? db
          .select({
            id: appUsers.id,
            name: appUsers.name,
            email: appUsers.email,
            role: appUsers.role,
            active: appUsers.active,
            updatedAt: appUsers.updatedAt,
            propertyId: appUsers.propertyId,
          })
          .from(appUsers)
          .where(
            and(
              eq(appUsers.organisationId, c.actor.organisationId),
              eq(appUsers.propertyId, c.property.id),
            ),
          )
      : [],
    roleCan(c.actor.role, 'property.manage')
      ? db
          .select({
            name: properties.name,
            city: properties.city,
            checkInTime: properties.checkInTime,
            checkOutTime: properties.checkOutTime,
            defaultTaxRateBps: properties.defaultTaxRateBps,
            restaurantGstProfile: properties.restaurantGstProfile,
            version: properties.version,
          })
          .from(properties)
          .where(
            and(
              eq(properties.id, c.property.id),
              eq(properties.organisationId, c.actor.organisationId),
            ),
          )
          .limit(1)
      : [],
    roleCan(c.actor.role, 'restaurant.manage')
      ? db
          .select({
            id: reservations.id,
            label: reservations.reference,
            status: reservations.status,
            roomNumber: rooms.number,
          })
          .from(reservations)
          .leftJoin(rooms, eq(rooms.id, reservations.roomId))
          .where(
            and(
              eq(reservations.propertyId, c.property.id),
              eq(reservations.organisationId, c.actor.organisationId),
              eq(reservations.status, 'CHECKED_IN'),
            ),
          )
          .then((rows) =>
            rows.map((row) => ({
              ...row,
              label: `${row.label} · Room ${row.roomNumber ?? '—'}`,
            })),
          )
      : [],
    roleCan(c.actor.role, 'restaurant.manage')
      ? db
          .select({
            id: appUsers.id,
            name: appUsers.name,
            role: appUsers.role,
          })
          .from(appUsers)
          .where(
            and(
              eq(appUsers.organisationId, c.actor.organisationId),
              eq(appUsers.propertyId, c.property.id),
              eq(appUsers.role, 'RESTAURANT'),
              eq(appUsers.active, true),
            ),
          )
          .orderBy(appUsers.name)
      : [],
    roleCan(c.actor.role, 'billing.view')
      ? db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organisationId, c.actor.organisationId),
              eq(invoices.propertyId, c.property.id),
            ),
          )
          .orderBy(desc(invoices.createdAt))
          .limit(500)
      : [],
    roleCan(c.actor.role, 'offline.bill.verify')
      ? db
          .select()
          .from(offlineBills)
          .where(eq(offlineBills.propertyId, c.property.id))
          .orderBy(desc(offlineBills.generatedAt))
          .limit(500)
      : [],
    roleCan(c.actor.role, 'restaurant.manage') ||
    roleCan(c.actor.role, 'billing.view')
      ? db
          .select()
          .from(restaurantOrderItems)
          .where(eq(restaurantOrderItems.propertyId, c.property.id))
          .orderBy(desc(restaurantOrderItems.createdAt))
          .limit(2000)
      : [],
  ]);

  let dashboardMetrics;

  if (roleCan(c.actor.role, 'reports.read')) {
    const [
      roomRows,
      stayRows,
      folioRows,
      inventoryRows,
      ticketRows,
    ] = await Promise.all([
      db
        .select({
          occupancyStatus: rooms.occupancyStatus,
          operationalStatus: rooms.operationalStatus,
        })
        .from(rooms)
        .where(
          and(
            eq(rooms.propertyId, c.property.id),
            eq(rooms.active, true),
          ),
        ),
      db
        .select({
          status: reservations.status,
          arrivalDate: reservations.arrivalDate,
          departureDate: reservations.departureDate,
          adults: reservations.adults,
          children: reservations.children,
          nightlyRatePaise: reservations.nightlyRatePaise,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.propertyId, c.property.id),
            eq(reservations.organisationId, c.actor.organisationId),
          ),
        ),
      db
        .select({
          totalPaise: folios.totalPaise,
          outstandingPaise: folios.outstandingPaise,
        })
        .from(folios)
        .where(
          and(
            eq(folios.propertyId, c.property.id),
            eq(folios.organisationId, c.actor.organisationId),
          ),
        ),
      db
        .select({
          currentQuantity: inventoryItems.currentQuantity,
          minimumQuantity: inventoryItems.minimumQuantity,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.propertyId, c.property.id)),
      db
        .select({ status: maintenanceTickets.status })
        .from(maintenanceTickets)
        .where(eq(maintenanceTickets.propertyId, c.property.id)),
    ]);

    dashboardMetrics = operatingMetrics(
      roomRows,
      stayRows,
      folioRows,
      {
        inventory: inventoryRows,
        maintenance: ticketRows,
      },
      new Intl.DateTimeFormat('en-CA', {
        timeZone: c.property.timezone,
      }).format(new Date()),
    );
  }

  return {
    dashboardMetrics,
    offlineBills: billRows,
    menuItems: menu,
    lostFound: lost,
    inventoryMovements: stock,
    staff,
    propertySettings: profile[0]
      ? {
          ...profile[0],
          restaurantGstProfile: normalizeRestaurantGstProfile(
            profile[0].restaurantGstProfile as RestaurantGstProfile,
          ),
        }
      : null,
    serviceStays,
    restaurantStaff,
    invoices: invoiceRows,
    restaurantOrderItems: restaurantItemRows,
  };
}

export async function mutateWorkflow(
  c: ReservationContext,
  action: WorkflowAction,
  raw: Record<string, unknown>,
) {
  if (
    c.actor.organisationId !== c.property.organisationId ||
    c.actor.propertyId !== c.property.id
  ) {
    throw new DomainError(
      'PROPERTY_FORBIDDEN',
      'An authenticated property context is required.',
      403,
    );
  }

  const permissions = {
    SAVE_MENU_ITEM: 'restaurant.manage',
    RECORD_LOST_ITEM: 'lostfound.manage',
    RELEASE_LOST_ITEM: 'lostfound.manage',
    MOVE_STOCK: 'inventory.write',
    SAVE_ROOM: 'rooms.manage',
    CREATE_HOUSEKEEPING_TASK: 'housekeeping.assign',
    CREATE_RESTAURANT_ORDER: 'restaurant.manage',
    UPDATE_RESTAURANT_ORDER: 'restaurant.manage',
    SAVE_STAFF: 'staff.manage',
    SAVE_PROPERTY: 'property.manage',
    BOOK_MEAL: 'restaurant.manage',
    SERVE_MEAL: 'restaurant.manage',
  } as const;

  assertRoleCan(c.actor.role, permissions[action]);

  // Parsing discards client actor, tenant and role claims except the authorized target staff role.
  const now = new Date().toISOString();

  return getDb().transaction(async (tx) => {
    if (action === 'SAVE_MENU_ITEM') {
      const p = workflowSchemas.SAVE_MENU_ITEM.parse(raw);
      const recordId = p.id ?? crypto.randomUUID();

      if (p.id) {
        const updated = await tx
          .update(menuItems)
          .set({
            name: p.name,
            category: p.category,
            pricePaise: p.pricePaise,
            available: p.available,
            version: sql`${menuItems.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(menuItems.id, p.id),
              eq(menuItems.propertyId, c.property.id),
              eq(menuItems.version, p.expectedVersion ?? 0),
            ),
          )
          .returning();

        if (!updated.length) {
          throw conflict();
        }
      } else {
        await tx.insert(menuItems).values({
          id: recordId,
          propertyId: c.property.id,
          name: p.name,
          category: p.category,
          pricePaise: p.pricePaise,
          available: p.available,
          updatedAt: now,
        });
      }

      await audit(tx, c, action, recordId, {
        name: p.name,
        pricePaise: p.pricePaise,
        available: p.available,
      });

      return { id: recordId };
    }

    if (action === 'RECORD_LOST_ITEM') {
      const p = workflowSchemas.RECORD_LOST_ITEM.parse(raw);
      const recordId = crypto.randomUUID();

      await tx.insert(lostFound).values({
        ...p,
        id: recordId,
        propertyId: c.property.id,
        createdAt: now,
        updatedAt: now,
      });

      await audit(tx, c, action, recordId, p);
      return { id: recordId };
    }

    if (action === 'RELEASE_LOST_ITEM') {
      const p = workflowSchemas.RELEASE_LOST_ITEM.parse(raw);

      const updated = await tx
        .update(lostFound)
        .set({
          status: 'RELEASED',
          custody: p.custody,
          version: p.expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(lostFound.id, p.id),
            eq(lostFound.propertyId, c.property.id),
            eq(lostFound.version, p.expectedVersion),
            inArray(lostFound.status, ['FOUND', 'STORED', 'CLAIMED']),
          ),
        )
        .returning();

      if (!updated.length) {
        throw conflict();
      }

      await audit(tx, c, action, p.id, { custody: p.custody });
      return { id: p.id };
    }

    if (action === 'MOVE_STOCK') {
      const p = workflowSchemas.MOVE_STOCK.parse(raw);

      const [item] = await tx
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.id, p.itemId),
            eq(inventoryItems.propertyId, c.property.id),
            c.actor.role === 'RESTAURANT'
              ? eq(inventoryItems.department, 'RESTAURANT')
              : undefined,
          ),
        )
        .for('update');

      if (!item) {
        throw new DomainError(
          'NOT_FOUND',
          'Stock item not found.',
          404,
        );
      }

      if (item.updatedAt !== p.expectedUpdatedAt) {
        throw conflict();
      }

      const balance = item.currentQuantity + p.delta;

      if (balance < 0) {
        throw new DomainError(
          'INSUFFICIENT_STOCK',
          'Stock cannot fall below zero.',
          409,
        );
      }

      await tx
        .update(inventoryItems)
        .set({
          currentQuantity: balance,
          updatedAt: now,
        })
        .where(eq(inventoryItems.id, item.id));

      await tx.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        propertyId: c.property.id,
        itemId: item.id,
        delta: p.delta,
        balance,
        reason: p.reason,
        actorId: c.actor.id,
        actorName: c.actor.name,
        createdAt: now,
      });

      await audit(tx, c, action, item.id, {
        delta: p.delta,
        balance,
        reason: p.reason,
      });

      return { balance };
    }

    if (action === 'CREATE_HOUSEKEEPING_TASK') {
      const p = workflowSchemas.CREATE_HOUSEKEEPING_TASK.parse(raw);
      const room = await roomFor(tx, c, p.roomId);

      if (
        ['MAINTENANCE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE'].includes(
          room.operationalStatus,
        )
      ) {
        throw new DomainError(
          'ROOM_OUT_OF_SERVICE',
          'Resolve maintenance before cleaning.',
          409,
        );
      }

      if (
        p.taskType === 'CHECKOUT_CLEANING' &&
        room.occupancyStatus !== 'VACANT'
      ) {
        throw new DomainError(
          'ROOM_OCCUPIED',
          'Checkout cleaning requires a vacant room.',
          409,
        );
      }

      const existing = await tx
        .select()
        .from(housekeepingTasks)
        .where(
          and(
            eq(housekeepingTasks.roomId, p.roomId),
            eq(housekeepingTasks.taskType, p.taskType),
            inArray(housekeepingTasks.status, [
              'UNASSIGNED',
              'ASSIGNED',
              'PENDING',
              'DEFERRED',
            ]),
          ),
        );

      if (existing.length) {
        throw new DomainError(
          'TASK_EXISTS',
          'This room already has an active task.',
          409,
        );
      }

      const recordId = crypto.randomUUID();

      await tx.insert(housekeepingTasks).values({
        ...p,
        id: recordId,
        propertyId: c.property.id,
        status: 'UNASSIGNED',
        scheduledAt: now,
        updatedAt: now,
      });

      await audit(tx, c, action, recordId, p);
      return { id: recordId };
    }

    if (action === 'SAVE_ROOM') {
      const p = workflowSchemas.SAVE_ROOM.parse(raw);
      const recordId = p.id ?? crypto.randomUUID();

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`room-number:${c.property.id}`}))`,
      );

      const duplicates = await tx
        .select()
        .from(rooms)
        .where(
          and(
            eq(rooms.propertyId, c.property.id),
            eq(rooms.number, p.number),
          ),
        );

      if (duplicates.some((room) => room.id !== p.id)) {
        throw new DomainError(
          'DUPLICATE_ROOM',
          'Room number already exists.',
          409,
        );
      }

      if (p.id) {
        await roomFor(tx, c, p.id);

        const updated = await tx
          .update(rooms)
          .set({
            number: p.number,
            roomType: p.roomType,
            floor: p.floor,
            baseRatePaise: p.baseRatePaise,
            version: sql`${rooms.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(rooms.id, p.id),
              eq(rooms.propertyId, c.property.id),
              eq(rooms.version, p.expectedVersion ?? 0),
            ),
          )
          .returning();

        if (!updated.length) {
          throw conflict();
        }
      } else {
        await tx.insert(rooms).values({
          id: recordId,
          propertyId: c.property.id,
          number: p.number,
          roomType: p.roomType,
          floor: p.floor,
          baseRatePaise: p.baseRatePaise,
          occupancyStatus: 'VACANT',
          operationalStatus: 'CLEAN',
          updatedAt: now,
        });
      }

      await audit(tx, c, action, recordId, {
        number: p.number,
        baseRatePaise: p.baseRatePaise,
      });

      return { id: recordId };
    }

    if (action === 'SAVE_PROPERTY') {
      const p = workflowSchemas.SAVE_PROPERTY.parse(raw);
      const { expectedVersion, ...fields } = p;

      const updated = await tx
        .update(properties)
        .set({
          ...fields,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(properties.id, c.property.id),
            eq(properties.organisationId, c.actor.organisationId),
            eq(properties.version, expectedVersion),
          ),
        )
        .returning({ id: properties.id });

      if (!updated.length) {
        throw conflict();
      }

      await audit(tx, c, action, c.property.id, fields);
      return { id: c.property.id };
    }

    if (action === 'SAVE_STAFF') {
      const p = workflowSchemas.SAVE_STAFF.parse(raw);

      if (p.id === c.actor.id) {
        throw new DomainError(
          'SELF_EDIT_BLOCKED',
          'Use My Profile to update your own account.',
          409,
        );
      }

      if (p.role === 'OWNER') {
        throw new DomainError(
          'OWNER_PROVISIONING_REQUIRED',
          'Owner accounts cannot be created or changed here.',
          403,
        );
      }

      const recordId = p.id ?? crypto.randomUUID();
      const passwordHash = p.password
        ? await hashPassword(p.password)
        : undefined;

      if (p.id) {
        const [existing] = await tx
          .select()
          .from(appUsers)
          .where(
            and(
              eq(appUsers.id, p.id),
              eq(appUsers.organisationId, c.actor.organisationId),
              eq(appUsers.propertyId, c.property.id),
            ),
          )
          .for('update');

        if (!existing || existing.role === 'OWNER') {
          throw new DomainError(
            'FORBIDDEN',
            'Staff account is not editable.',
            403,
          );
        }

        if ((existing.updatedAt ?? null) !== (p.expectedUpdatedAt ?? null)) {
          throw conflict();
        }

        if (
          existing.authProvider !== 'local-session' &&
          (p.password || p.email !== existing.email)
        ) {
          throw new DomainError(
            'IDENTITY_MANAGED',
            'Identity email and password are managed by the sign-in provider.',
            409,
          );
        }

        await tx
          .update(appUsers)
          .set({
            name: p.name,
            displayName: p.name,
            email: p.email.toLowerCase(),
            authSubject:
              existing.authProvider === 'local-session'
                ? p.email.toLowerCase()
                : existing.authSubject,
            role: p.role,
            active: p.active,
            passwordHash,
            updatedAt: now,
          })
          .where(eq(appUsers.id, p.id));

        await tx
          .delete(userSessions)
          .where(eq(userSessions.userId, p.id));
      } else {
        if (!passwordHash) {
          throw new DomainError(
            'PASSWORD_REQUIRED',
            'An initial password is required.',
            400,
          );
        }

        await tx.insert(appUsers).values({
          id: recordId,
          organisationId: c.actor.organisationId,
          propertyId: c.property.id,
          name: p.name,
          email: p.email.toLowerCase(),
          authProvider: 'local-session',
          authSubject: p.email.toLowerCase(),
          passwordHash,
          role: p.role,
          active: p.active,
          createdAt: now,
          updatedAt: now,
        });
      }

      await audit(tx, c, action, recordId, {
        role: p.role,
        active: p.active,
      });

      return { id: recordId };
    }

    if (action === 'CREATE_RESTAURANT_ORDER') {
      const p = workflowSchemas.CREATE_RESTAURANT_ORDER.parse(raw);
      const dineIn = p.orderType === 'RESTAURANT';

      const requestedItems =
        p.items && p.items.length > 0
          ? p.items
          : [
              {
                menuItemId: p.menuItemId!,
                quantity: p.quantity!,
              },
            ];

      const combined = new Map<string, number>();

      for (const item of requestedItems) {
        const nextQuantity =
          (combined.get(item.menuItemId) ?? 0) + item.quantity;

        if (nextQuantity > 100) {
          throw new DomainError(
            'ORDER_QUANTITY_TOO_LARGE',
            'A menu item cannot exceed quantity 100 in one order.',
            400,
          );
        }

        combined.set(item.menuItemId, nextQuantity);
      }

      const normalizedItems = Array.from(combined.entries())
        .map(([menuItemId, quantity]) => ({
          menuItemId,
          quantity,
        }))
        .sort((left, right) =>
          left.menuItemId.localeCompare(right.menuItemId),
        );

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`order:${p.clientOperationId}`}))`,
      );

      const [existing] = await tx
        .select()
        .from(restaurantOrders)
        .where(eq(restaurantOrders.id, p.clientOperationId));

      if (existing) {
        if (existing.propertyId !== c.property.id) {
          throw new DomainError(
            'FORBIDDEN',
            'Invalid order key.',
            403,
          );
        }

        const [original] = await tx
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.entityId, existing.id),
              eq(auditLogs.action, 'CREATE_RESTAURANT_ORDER'),
              eq(auditLogs.propertyId, c.property.id),
            ),
          );

        const details = JSON.parse(original?.newValue ?? '{}') as {
          items?: Array<{ menuItemId: string; quantity: number }>;
          menuItemId?: string;
          quantity?: number;
        };

        const originalItems = (
          details.items?.length
            ? details.items
            : details.menuItemId && details.quantity
              ? [
                  {
                    menuItemId: details.menuItemId,
                    quantity: details.quantity,
                  },
                ]
              : []
        )
          .map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
          }))
          .sort((left, right) =>
            left.menuItemId.localeCompare(right.menuItemId),
          );

        if (
          (existing.reservationId ?? null) !== (p.reservationId ?? null) ||
          existing.orderType !== p.orderType ||
          (existing.tableNumber ?? null) !==
            (dineIn ? p.tableNumber ?? null : null) ||
          (existing.covers ?? null) !== (dineIn ? p.covers ?? null : null) ||
          (existing.waiterUserId ?? null) !==
            (dineIn ? p.waiterUserId ?? null : null) ||
          JSON.stringify(originalItems) !== JSON.stringify(normalizedItems) ||
          (existing.specialInstructions ?? '') !==
            (p.specialInstructions ?? '')
        ) {
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This order key was already used for a different order.',
            409,
          );
        }

        return { id: existing.id };
      }

      const [stay] = p.reservationId
        ? await tx
            .select()
            .from(reservations)
            .where(
              and(
                eq(reservations.id, p.reservationId),
                eq(reservations.propertyId, c.property.id),
                eq(reservations.organisationId, c.actor.organisationId),
                eq(reservations.status, 'CHECKED_IN'),
              ),
            )
            .for('update')
        : [];

      if (p.reservationId && !stay) {
        throw new DomainError(
          'STAY_NOT_ACTIVE',
          'Choose an active checked-in reservation.',
          409,
        );
      }

      if (p.orderType === 'ROOM_SERVICE' && !stay) {
        throw new DomainError(
          'STAY_NOT_ACTIVE',
          'Choose a checked-in reservation for room service.',
          409,
        );
      }

      const [waiter] = dineIn && p.waiterUserId
        ? await tx
            .select({
              id: appUsers.id,
              name: appUsers.name,
            })
            .from(appUsers)
            .where(
              and(
                eq(appUsers.id, p.waiterUserId),
                eq(appUsers.organisationId, c.actor.organisationId),
                eq(appUsers.propertyId, c.property.id),
                eq(appUsers.role, 'RESTAURANT'),
                eq(appUsers.active, true),
              ),
            )
            .limit(1)
        : [];

      if (dineIn && !waiter) {
        throw new DomainError(
          'WAITER_NOT_ELIGIBLE',
          'Choose an active restaurant staff member as waiter.',
          409,
        );
      }

      const [folioKey] = stay
        ? await tx
            .select({ id: folios.id })
            .from(folios)
            .where(
              and(
                eq(folios.reservationId, stay.id),
                eq(folios.propertyId, c.property.id),
                eq(folios.organisationId, c.actor.organisationId),
              ),
            )
        : [];

      if (stay && !folioKey) {
        throw new DomainError(
          'FOLIO_NOT_OPEN',
          'Create a guest folio before posting this order to the room.',
          409,
        );
      }

      if (folioKey) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`folio:${folioKey.id}`}))`,
        );
      }

      const [folio] = folioKey
        ? await tx
            .select()
            .from(folios)
            .where(eq(folios.id, folioKey.id))
            .for('update')
        : [];

      if (folioKey && (!folio || !['OPEN', 'SETTLED'].includes(folio.status))) {
        throw new DomainError(
          'FOLIO_NOT_OPEN',
          'The guest folio must be open.',
          409,
        );
      }

      const menuIds = normalizedItems.map((item) => item.menuItemId);

      const menuRows = await tx
        .select()
        .from(menuItems)
        .where(
          and(
            eq(menuItems.propertyId, c.property.id),
            eq(menuItems.available, true),
            inArray(menuItems.id, menuIds),
          ),
        );

      if (menuRows.length !== menuIds.length) {
        throw new DomainError(
          'MENU_UNAVAILABLE',
          'One or more selected menu items are unavailable.',
          409,
        );
      }

      const menuById = new Map(
        menuRows.map((item) => [item.id, item]),
      );

      const [profile] = await tx
        .select()
        .from(properties)
        .where(eq(properties.id, c.property.id));

      if (!profile) {
        throw new DomainError(
          'PROPERTY_NOT_FOUND',
          'Property settings are unavailable.',
          404,
        );
      }

      const restaurantGstProfile = normalizeRestaurantGstProfile(
        profile.restaurantGstProfile as RestaurantGstProfile,
      );
      const restaurantTaxRateBps = restaurantGstRateBps(
        restaurantGstProfile,
      );

      const calculatedItems = normalizedItems.map((requested) => {
        const menu = menuById.get(requested.menuItemId);

        if (!menu) {
          throw new DomainError(
            'MENU_UNAVAILABLE',
            'One or more selected menu items are unavailable.',
            409,
          );
        }

        const values = calculateLine(
          requested.quantity,
          menu.pricePaise,
          0,
          restaurantTaxRateBps,
          profile.defaultTaxMode as 'CGST_SGST' | 'IGST' | 'EXEMPT',
        );

        return {
          id: crypto.randomUUID(),
          menu,
          quantity: requested.quantity,
          values,
        };
      });

      const totals = calculatedItems.reduce(
        (sum, item) => ({
          subtotalPaise: sum.subtotalPaise + item.values.subtotalPaise,
          taxableAmountPaise:
            sum.taxableAmountPaise + item.values.taxableAmountPaise,
          taxPaise: sum.taxPaise + item.values.taxPaise,
          cgstPaise: sum.cgstPaise + item.values.cgstPaise,
          sgstPaise: sum.sgstPaise + item.values.sgstPaise,
          igstPaise: sum.igstPaise + item.values.igstPaise,
          totalPaise: sum.totalPaise + item.values.totalPaise,
        }),
        {
          subtotalPaise: 0,
          taxableAmountPaise: 0,
          taxPaise: 0,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
          totalPaise: 0,
        },
      );

      if (folio && folio.totalPaise + totals.totalPaise > 2_000_000_000) {
        throw new DomainError(
          'AMOUNT_TOO_LARGE',
          'Order exceeds the supported folio amount.',
          400,
        );
      }

      const [room] = stay?.roomId
        ? await tx
            .select()
            .from(rooms)
            .where(eq(rooms.id, stay.roomId))
        : [];

      const paymentStatus = folio ? 'POSTED_TO_FOLIO' : 'UNPAID';

      await tx.insert(restaurantOrders).values({
        id: p.clientOperationId,
        propertyId: c.property.id,
        reservationId: stay?.id ?? null,
        roomNumber: room?.number ?? null,
        tableNumber: dineIn ? p.tableNumber! : null,
        covers: dineIn ? p.covers! : null,
        waiterUserId: dineIn ? waiter!.id : null,
        waiterName: dineIn ? waiter!.name : null,
        orderType: p.orderType,
        status: 'PENDING',
        kotStatus: 'NEW',
        itemCount: calculatedItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        specialInstructions: p.specialInstructions || null,
        totalPaise: totals.totalPaise,
        paymentStatus,
        createdAt: now,
      });

      await tx.insert(restaurantOrderItems).values(
        calculatedItems.map((item) => ({
          id: item.id,
          propertyId: c.property.id,
          orderId: p.clientOperationId,
          menuItemId: item.menu.id,
          itemName: item.menu.name,
          category: item.menu.category,
          quantity: item.quantity,
          unitPricePaise: item.menu.pricePaise,
          taxRateBps: restaurantTaxRateBps,
          subtotalPaise: item.values.subtotalPaise,
          taxableAmountPaise: item.values.taxableAmountPaise,
          taxPaise: item.values.taxPaise,
          cgstPaise: item.values.cgstPaise,
          sgstPaise: item.values.sgstPaise,
          igstPaise: item.values.igstPaise,
          totalPaise: item.values.totalPaise,
          createdAt: now,
        })),
      );

      if (folio) {
        await tx.insert(folioLines).values(
          calculatedItems.map((item) => ({
            id: crypto.randomUUID(),
            organisationId: c.actor.organisationId,
            propertyId: c.property.id,
            folioId: folio.id,
            description: `${p.orderType}: ${item.menu.name}`,
            category: p.orderType,
            quantity: item.quantity,
            unitAmountPaise: item.menu.pricePaise,
            taxRateBps: restaurantTaxRateBps,
            lineTotalPaise: item.values.totalPaise,
            ...item.values,
            source: 'RESTAURANT',
            sourceType: 'RESTAURANT_ORDER',
            sourceId: restaurantFolioLineSourceId(
              p.clientOperationId,
              item.menu.id,
            ),
            postedBy: c.actor.id,
            createdAt: now,
          })),
        );

        await tx
          .update(folios)
          .set({
            status:
              folio.outstandingPaise + totals.totalPaise > 0
                ? 'OPEN'
                : 'SETTLED',
            subtotalPaise: folio.subtotalPaise + totals.subtotalPaise,
            taxableAmountPaise:
              folio.taxableAmountPaise + totals.taxableAmountPaise,
            taxPaise: folio.taxPaise + totals.taxPaise,
            cgstPaise: folio.cgstPaise + totals.cgstPaise,
            sgstPaise: folio.sgstPaise + totals.sgstPaise,
            igstPaise: folio.igstPaise + totals.igstPaise,
            totalPaise: folio.totalPaise + totals.totalPaise,
            outstandingPaise:
              folio.outstandingPaise + totals.totalPaise,
            version: folio.version + 1,
            updatedAt: now,
          })
          .where(eq(folios.id, folio.id));
      }

      await audit(tx, c, action, p.clientOperationId, {
        reservationId: stay?.id ?? null,
        tableNumber: dineIn ? p.tableNumber : null,
        covers: dineIn ? p.covers : null,
        waiterUserId: dineIn ? waiter?.id : null,
        waiterName: dineIn ? waiter?.name : null,
        items: normalizedItems,
        itemCount: calculatedItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        specialInstructions: p.specialInstructions || null,
        restaurantGstProfile,
        taxRateBps: restaurantTaxRateBps,
        paymentStatus,
        totalPaise: totals.totalPaise,
      });

      return {
        id: p.clientOperationId,
        itemCount: calculatedItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        totalPaise: totals.totalPaise,
        kotStatus: 'NEW',
        paymentStatus,
      };
    }

    if (action === 'UPDATE_RESTAURANT_ORDER') {
      const p = workflowSchemas.UPDATE_RESTAURANT_ORDER.parse(raw);
      const previous = {
        PREPARING: 'PENDING',
        READY: 'PREPARING',
        DELIVERED: 'READY',
      }[p.status];

      const updated = await tx
        .update(restaurantOrders)
        .set({
          status: p.status,
          kotStatus:
            {
              PREPARING: 'FIRED',
              READY: 'READY',
              DELIVERED: 'SERVED',
            }[p.status] ?? 'NEW',
          version: p.expectedVersion + 1,
        })
        .where(
          and(
            eq(restaurantOrders.id, p.id),
            eq(restaurantOrders.propertyId, c.property.id),
            eq(restaurantOrders.version, p.expectedVersion),
            eq(restaurantOrders.status, previous),
          ),
        )
        .returning();

      if (!updated.length) {
        throw conflict();
      }

      await audit(tx, c, action, p.id, {
        status: p.status,
        kotStatus:
          {
            PREPARING: 'FIRED',
            READY: 'READY',
            DELIVERED: 'SERVED',
          }[p.status] ?? 'NEW',
      });
      return { id: p.id };
    }

    if (action === 'BOOK_MEAL') {
      const p = workflowSchemas.BOOK_MEAL.parse(raw);

      const [reservation] = await tx
        .select()
        .from(reservations)
        .where(
          and(
            eq(reservations.id, p.reservationId),
            eq(reservations.organisationId, c.actor.organisationId),
            eq(reservations.propertyId, c.property.id),
            inArray(reservations.status, ['CONFIRMED', 'CHECKED_IN']),
          ),
        );

      if (
        !reservation ||
        p.serviceDate < reservation.arrivalDate ||
        p.serviceDate > reservation.departureDate
      ) {
        throw new DomainError(
          'INVALID_MEAL_STAY',
          'Meal date must belong to an active stay.',
          409,
        );
      }

      const recordId = crypto.randomUUID();

      const inserted = await tx
        .insert(restaurantMealBookings)
        .values({
          ...p,
          id: recordId,
          propertyId: c.property.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: restaurantMealBookings.id });

      if (!inserted.length) {
        throw new DomainError(
          'MEAL_EXISTS',
          'This stay already has this meal booked for that date.',
          409,
        );
      }

      await audit(tx, c, action, recordId, p);
      return { id: recordId };
    }

    if (action === 'SERVE_MEAL') {
      const p = workflowSchemas.SERVE_MEAL.parse(raw);

      const updated = await tx
        .update(restaurantMealBookings)
        .set({
          status: 'SERVED',
          updatedAt: now,
        })
        .where(
          and(
            eq(restaurantMealBookings.id, p.id),
            eq(restaurantMealBookings.propertyId, c.property.id),
            eq(restaurantMealBookings.status, 'BOOKED'),
          ),
        )
        .returning();

      if (!updated.length) {
        throw conflict();
      }

      await audit(tx, c, action, p.id, {});
      return { id: p.id };
    }

    throw new DomainError(
      'UNKNOWN_OPERATION',
      'Unsupported action.',
      400,
    );
  });
}