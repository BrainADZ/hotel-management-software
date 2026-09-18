import { and, desc, eq, inArray } from 'drizzle-orm';
import { assertRoleCan, DomainError, roleCan } from '@hotel/shared/domain';
import { auditLogs, customTravelPackageItems, customTravelPackages, inquiries, travelAssets, travelDiscountRequests, travelFollowUps, travelPackages } from '@/db/schema';
import { getDb } from '@/db';
import type { TravelContext } from './context';
import {travelWorkflowSnapshot} from './workflows';
import { createFollowUpSchema, createInquirySchema, createPackageSchema, discountDecisionSchema, packagePricingSchema, updateFollowUpSchema, updateInquirySchema } from './validation';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

function audit(db: Db | Tx, c: TravelContext, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  return db.insert(auditLogs).values({ id: id(), timestamp: now(), actorId: c.actor.id, actorName: c.actor.name, role: c.actor.role, propertyId: null, deviceId: null, action, entity, entityId, previousValue: before == null ? null : JSON.stringify(before), newValue: after == null ? null : JSON.stringify(after), source: 'PRODUCTION_TRAVEL_API', correlationId: id() });
}

export class TravelService {
  async snapshot(c: TravelContext) {
    const db = getDb(), organisationId = c.organisation.id;
    const [packages, assets, customPackages, customItems, discountRows, inquiryRows, followUps] = await Promise.all([
      db.select().from(travelPackages).where(eq(travelPackages.organisationId, organisationId)).limit(200),
      db.select().from(travelAssets).where(and(eq(travelAssets.organisationId, organisationId), eq(travelAssets.active, true))).limit(500),
      db.select().from(customTravelPackages).where(eq(customTravelPackages.organisationId, organisationId)).orderBy(desc(customTravelPackages.updatedAt)).limit(200),
      db.select({ item: customTravelPackageItems }).from(customTravelPackageItems).innerJoin(customTravelPackages, eq(customTravelPackageItems.packageId, customTravelPackages.id)).where(eq(customTravelPackages.organisationId, organisationId)).then(rows => rows.map(row => row.item)),
      db.select({ request: travelDiscountRequests, packageReference: customTravelPackages.reference, packageName: customTravelPackages.name, clientName: customTravelPackages.clientName }).from(travelDiscountRequests).innerJoin(customTravelPackages, eq(customTravelPackages.id, travelDiscountRequests.packageId)).where(eq(travelDiscountRequests.organisationId, organisationId)).orderBy(desc(travelDiscountRequests.createdAt)).limit(200),
      db.select().from(inquiries).where(eq(inquiries.organisationId, organisationId)).orderBy(desc(inquiries.createdAt)).limit(500),
      db.select().from(travelFollowUps).where(eq(travelFollowUps.organisationId, organisationId)).orderBy(desc(travelFollowUps.dueAt)).limit(500),
    ]);
    return { ...await travelWorkflowSnapshot(c), packages, travelAssets: assets, customPackages, customPackageItems: customItems, discountRequests: discountRows.map(row => ({ ...row.request, packageReference: row.packageReference, packageName: row.packageName, clientName: row.clientName })), inquiries: inquiryRows, followUps };
  }

  async createInquiry(c: TravelContext, raw: unknown) {
    assertRoleCan(c.actor.role, 'travel.read');
    const input = createInquirySchema.parse(raw), db = getDb(), timestamp = now(), inquiryId = id();
    const reference = `INQ-${Date.now().toString().slice(-7)}-${id().slice(0, 3).toUpperCase()}`;
    const record = { id: inquiryId, organisationId: c.organisation.id, reference, ...input, followUpAt: input.followUpAt ?? null, notes: input.notes ?? null, updatedBy: c.actor.id, createdAt: timestamp, updatedAt: timestamp };
    await db.transaction(async tx => { await tx.insert(inquiries).values(record); await audit(tx, c, 'TRAVEL_INQUIRY_CREATED', 'TRAVEL_INQUIRY', inquiryId, null, record); });
    return record;
  }

  async updateInquiry(c: TravelContext, inquiryId: string, raw: unknown) {
    assertRoleCan(c.actor.role, 'travel.read');
    const input = updateInquirySchema.parse(raw), db = getDb();
    return db.transaction(async tx => {
      const previous = (await tx.select().from(inquiries).where(and(eq(inquiries.id, inquiryId), eq(inquiries.organisationId, c.organisation.id))).limit(1).for('update'))[0];
      if (!previous) throw new DomainError('NOT_FOUND', 'Travel inquiry not found.', 404);
      if (input.expectedUpdatedAt && previous.updatedAt && input.expectedUpdatedAt !== previous.updatedAt) throw new DomainError('STALE_INQUIRY', 'This inquiry changed. Refresh and try again.', 409);
      const changes = { ...input };
      delete changes.expectedUpdatedAt;
      const updatedAt = now();
      const next = { ...changes, updatedBy: c.actor.id, updatedAt };
      await tx.update(inquiries).set(next).where(and(eq(inquiries.id, inquiryId), eq(inquiries.organisationId, c.organisation.id)));
      await audit(tx, c, previous.status !== changes.status && changes.status ? 'TRAVEL_PIPELINE_STAGE_CHANGED' : 'TRAVEL_INQUIRY_UPDATED', 'TRAVEL_INQUIRY', inquiryId, previous, next);
      return { ...previous, ...next };
    });
  }

  async createPackage(c: TravelContext, raw: unknown) {
    assertRoleCan(c.actor.role, 'travel.package.create');
    const input = createPackageSchema.parse(raw), db = getDb(), quantities = new Map<string, number>();
    for (const selection of input.assetSelections) quantities.set(selection.assetId, (quantities.get(selection.assetId) ?? 0) + selection.quantity);
    const assetIds = [...quantities.keys()];
    return db.transaction(async tx => {
      const assets = await tx.select().from(travelAssets).where(and(eq(travelAssets.organisationId, c.organisation.id), eq(travelAssets.active, true), inArray(travelAssets.id, assetIds)));
      if (assets.length !== assetIds.length) throw new DomainError('PACKAGE_ASSET_UNAVAILABLE', 'One or more selected assets are unavailable.', 409);
      const items = assets.map(asset => ({ asset, quantity: quantities.get(asset.id)!, lineTotalRupees: asset.unitPriceRupees * quantities.get(asset.id)! }));
      const subtotal = items.reduce((sum, item) => sum + item.lineTotalRupees, 0), canPrice = roleCan(c.actor.role, 'travel.pricing.manage');
      const base = canPrice && input.basePriceRupees ? input.basePriceRupees : subtotal;
      const floor = canPrice && input.floorPriceRupees !== undefined ? input.floorPriceRupees : Math.round(base * .9);
      if (floor > base) throw new DomainError('INVALID_PACKAGE_PRICING', 'Floor price cannot exceed base price.', 400);
      const belowFloor = input.quotedPriceRupees < floor, reason = input.discountReason?.trim() ?? '';
      if (belowFloor && !canPrice && reason.length < 5) throw new DomainError('DISCOUNT_REASON_REQUIRED', 'A reason is required for a below-floor quote.', 400);
      const packageId = id(), timestamp = now(), reference = `PKG-${Date.now().toString().slice(-7)}-${id().slice(0, 3).toUpperCase()}`;
      const status = belowFloor && !canPrice ? 'DISCOUNT_REQUESTED' : 'READY_TO_SEND';
      const record = { id: packageId, organisationId: c.organisation.id, reference, clientName: input.clientName, name: input.name, ownerId: c.actor.id, ownerName: c.actor.name, assetSubtotalRupees: subtotal, basePriceRupees: base, floorPriceRupees: floor, quotedPriceRupees: input.quotedPriceRupees, status, version: 1, createdAt: timestamp, updatedAt: timestamp };
      await tx.insert(customTravelPackages).values(record);
      await tx.insert(customTravelPackageItems).values(items.map(item => ({ id: id(), packageId, assetId: item.asset.id, assetName: item.asset.name, category: item.asset.category, pricingUnit: item.asset.pricingUnit, quantity: item.quantity, unitPriceRupees: item.asset.unitPriceRupees, lineTotalRupees: item.lineTotalRupees })));
      let discountRequestId: string | null = null;
      if (belowFloor && !canPrice) { discountRequestId = id(); await tx.insert(travelDiscountRequests).values({ id: discountRequestId, organisationId: c.organisation.id, packageId, packageVersion: 1, requestedById: c.actor.id, requestedByName: c.actor.name, requestedPriceRupees: input.quotedPriceRupees, basePriceRupees: base, floorPriceRupees: floor, reason, status: 'PENDING', createdAt: timestamp }); }
      await audit(tx, c, 'CUSTOM_PACKAGE_CREATED', 'CUSTOM_TRAVEL_PACKAGE', packageId, null, record);
      return { packageId, reference, status, assetSubtotalRupees: subtotal, basePriceRupees: base, floorPriceRupees: floor, quotedPriceRupees: input.quotedPriceRupees, discountRequestId };
    });
  }

  async setPackagePricing(c: TravelContext, packageId: string, raw: unknown) {
    assertRoleCan(c.actor.role, 'travel.pricing.manage');
    const input = packagePricingSchema.parse(raw), db = getDb();
    if (input.floorPriceRupees > input.basePriceRupees) throw new DomainError('INVALID_PACKAGE_PRICING', 'Floor price cannot exceed base price.', 400);
    return db.transaction(async tx => {
      const previous = (await tx.select().from(customTravelPackages).where(and(eq(customTravelPackages.id, packageId), eq(customTravelPackages.organisationId, c.organisation.id))).limit(1))[0];
      if (!previous) throw new DomainError('NOT_FOUND', 'Custom package not found.', 404);
      if (input.expectedVersion && input.expectedVersion !== previous.version) throw new DomainError('STALE_PACKAGE', 'Package pricing changed. Refresh and try again.', 409);
      const timestamp = now(), version = previous.version + 1, status = previous.quotedPriceRupees < input.floorPriceRupees ? 'NEEDS_REPRICE' : 'READY_TO_SEND';
      await tx.update(customTravelPackages).set({ basePriceRupees: input.basePriceRupees, floorPriceRupees: input.floorPriceRupees, status, version, updatedAt: timestamp }).where(and(eq(customTravelPackages.id, packageId), eq(customTravelPackages.organisationId, c.organisation.id), eq(customTravelPackages.version, previous.version)));
      await tx.update(travelDiscountRequests).set({ status: 'STALE', decidedAt: timestamp }).where(and(eq(travelDiscountRequests.organisationId, c.organisation.id), eq(travelDiscountRequests.packageId, packageId), eq(travelDiscountRequests.status, 'PENDING')));
      await audit(tx, c, 'PACKAGE_PRICING_SET', 'CUSTOM_TRAVEL_PACKAGE', packageId, previous, { ...input, status, version });
      return { packageId, ...input, status, version };
    });
  }

  async resolveDiscount(c: TravelContext, requestId: string, raw: unknown) {
    assertRoleCan(c.actor.role, 'travel.discount.approve');
    const input = discountDecisionSchema.parse(raw), db = getDb();
    return db.transaction(async tx => {
      const row = (await tx.select({ request: travelDiscountRequests, package: customTravelPackages }).from(travelDiscountRequests).innerJoin(customTravelPackages, eq(customTravelPackages.id, travelDiscountRequests.packageId)).where(and(eq(travelDiscountRequests.id, requestId), eq(travelDiscountRequests.organisationId, c.organisation.id), eq(customTravelPackages.organisationId, c.organisation.id))).limit(1))[0];
      if (!row) throw new DomainError('NOT_FOUND', 'Discount request not found.', 404);
      if (row.request.status !== 'PENDING') throw new DomainError('DISCOUNT_ALREADY_RESOLVED', 'This discount request is already resolved.', 409);
      if (row.request.requestedById === c.actor.id) throw new DomainError('SELF_APPROVAL_FORBIDDEN', 'The requester cannot approve their own discount.', 403);
      if (row.request.packageVersion !== row.package.version) throw new DomainError('STALE_DISCOUNT_REQUEST', 'Package pricing changed after this request.', 409);
      const timestamp = now(), packageStatus = input.decision === 'APPROVED' ? 'READY_TO_SEND' : 'NEEDS_REPRICE';
      await tx.update(travelDiscountRequests).set({ status: input.decision, reviewedById: c.actor.id, reviewedByName: c.actor.name, decisionNote: input.decisionNote ?? null, decidedAt: timestamp }).where(and(eq(travelDiscountRequests.id, requestId), eq(travelDiscountRequests.organisationId, c.organisation.id), eq(travelDiscountRequests.status, 'PENDING')));
      await tx.update(customTravelPackages).set({ ...(input.decision === 'APPROVED' ? { quotedPriceRupees: row.request.requestedPriceRupees } : {}), status: packageStatus, updatedAt: timestamp }).where(and(eq(customTravelPackages.id, row.package.id), eq(customTravelPackages.organisationId, c.organisation.id)));
      await audit(tx, c, `PACKAGE_DISCOUNT_${input.decision}`, 'TRAVEL_DISCOUNT_REQUEST', requestId, row.request, { ...input, packageStatus });
      return { requestId, packageId: row.package.id, status: input.decision, packageStatus };
    });
  }

  async createFollowUp(c: TravelContext, raw: unknown) {
    const input = createFollowUpSchema.parse(raw), db = getDb(), timestamp = now();
    const inquiry = (await db.select({ id: inquiries.id }).from(inquiries).where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.organisationId, c.organisation.id))).limit(1).for('update'))[0];
    if (!inquiry) throw new DomainError('NOT_FOUND', 'Travel inquiry not found.', 404);
    const record = { id: id(), organisationId: c.organisation.id, ...input, notes: input.notes ?? null, assignedToId: input.assignedToId ?? null, status: 'PENDING', createdById: c.actor.id, completedById: null, completedAt: null, createdAt: timestamp, updatedAt: timestamp, version: 1 };
    await db.transaction(async tx => { await tx.insert(travelFollowUps).values(record); await audit(tx, c, 'TRAVEL_FOLLOW_UP_CREATED', 'TRAVEL_FOLLOW_UP', record.id, null, record); });
    return record;
  }

  async updateFollowUp(c: TravelContext, followUpId: string, raw: unknown) {
    const input = updateFollowUpSchema.parse(raw), db = getDb();
    return db.transaction(async tx => {
      const previous = (await tx.select().from(travelFollowUps).where(and(eq(travelFollowUps.id, followUpId), eq(travelFollowUps.organisationId, c.organisation.id))).limit(1))[0];
      if (!previous) throw new DomainError('NOT_FOUND', 'Travel follow-up not found.', 404);
      if (previous.version !== input.expectedVersion) throw new DomainError('STALE_FOLLOW_UP', 'This follow-up changed. Refresh and try again.', 409);
      const timestamp = now(), completed = input.status === 'COMPLETED', next = { dueAt: input.dueAt, status: input.status, notes: input.notes, completedById: completed ? c.actor.id : undefined, completedAt: completed ? timestamp : undefined, updatedAt: timestamp, version: previous.version + 1 };
      await tx.update(travelFollowUps).set(next).where(and(eq(travelFollowUps.id, followUpId), eq(travelFollowUps.organisationId, c.organisation.id), eq(travelFollowUps.version, previous.version)));
      await audit(tx, c, completed ? 'TRAVEL_FOLLOW_UP_COMPLETED' : 'TRAVEL_FOLLOW_UP_UPDATED', 'TRAVEL_FOLLOW_UP', followUpId, previous, next);
      return { ...previous, ...next };
    });
  }
}
