import { and, eq } from 'drizzle-orm';
import { auditLogs, damagePolicyRules, damageReports, folioLines, folios, housekeepingTasks, inventoryItems, maintenanceTickets, roomInspections, rooms } from '@/db/schema';
import { getDb } from '@/db';
import type { ReservationContext } from '@/services/reservations/types';
import { assertRoleCan, calculatePolicyDamageCharge, DomainError, normalizeDamageSeverity } from '@hotel/shared/domain';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const now = () => new Date().toISOString();

function audit(db: Db | Tx, c: ReservationContext, action: string, entity: string, entityId: string, previousValue: unknown, newValue: unknown) {
  return db.insert(auditLogs).values({ id: crypto.randomUUID(), timestamp: now(), actorId: c.actor.id, actorName: c.actor.name, role: c.actor.role, propertyId: c.property.id, deviceId: null, action, entity, entityId, previousValue: previousValue == null ? null : JSON.stringify(previousValue), newValue: newValue == null ? null : JSON.stringify(newValue), source: 'PRODUCTION_API', correlationId: crypto.randomUUID() });
}

function integer(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new DomainError('INVALID_INPUT', `${label} must be a non-negative whole number.`, 400);
  return parsed;
}

export async function mutateOperations(c: ReservationContext, raw: Record<string, unknown>) {
  const action = String(raw.action ?? '');
  if (action === 'UPSERT_INVENTORY') return upsertInventory(c, raw);
  assertRoleCan(c.actor.role, action === 'RESOLVE_DAMAGE_REPORT' ? 'damage.review' : 'operations.write');
  if (action === 'RECORD_HOUSEKEEPING_OUTCOME') return recordOutcome(c, raw);
  if (action === 'SUBMIT_ROOM_INSPECTION') return submitInspection(c, raw);
  if (action === 'RESOLVE_DAMAGE_REPORT') return resolveDamage(c, raw);
  throw new DomainError('UNKNOWN_OPERATION', 'Unsupported operations command.', 400);
}

async function recordOutcome(c: ReservationContext, raw: Record<string, unknown>) {
  const id = String(raw.taskId ?? ''), version = integer(raw.expectedVersion, 'Expected version'), outcome = String(raw.outcome ?? '').toUpperCase();
  if (!['DONE', 'GUEST_REFUSED', 'COME_LATER'].includes(outcome)) throw new DomainError('INVALID_HOUSEKEEPING_OUTCOME', 'Choose Done, Guest refused or Come later.', 400);
  return getDb().transaction(async tx => {
    const task = (await tx.select().from(housekeepingTasks).where(and(eq(housekeepingTasks.id, id), eq(housekeepingTasks.propertyId, c.property.id))).limit(1))[0];
    if (!task) throw new DomainError('NOT_FOUND', 'Housekeeping task not found.', 404);
    if (task.version !== version || ['COMPLETED', 'CANCELLED'].includes(task.status)) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This room task has already changed.', 409);
    if (!['STAY_SERVICE', 'CHECKOUT_CLEANING'].includes(task.taskType)) throw new DomainError('INSPECTION_REQUIRED', 'Complete checkout inspections through room inspection.', 409);
    if (task.taskType === 'CHECKOUT_CLEANING' && outcome === 'GUEST_REFUSED') throw new DomainError('INVALID_HOUSEKEEPING_OUTCOME', 'Checkout cleaning cannot be refused.', 409);
    const timestamp = now(), deferredUntil = outcome === 'COME_LATER' ? String(raw.deferredUntil ?? '') : null;
    if (deferredUntil && (!Number.isFinite(Date.parse(deferredUntil)) || Date.parse(deferredUntil) <= Date.now())) throw new DomainError('INVALID_DEFER_TIME', 'Choose a future return time.', 400);
    const status = deferredUntil ? 'DEFERRED' : 'COMPLETED';
    const changed = await tx.update(housekeepingTasks).set({ status, outcome, deferredUntil, scheduledAt: deferredUntil ?? task.scheduledAt, completedAt: status === 'COMPLETED' ? timestamp : null, updatedAt: timestamp, version: version + 1 }).where(and(eq(housekeepingTasks.id, id), eq(housekeepingTasks.version, version))).returning({ id: housekeepingTasks.id });
    if (!changed.length) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This room task changed before it could be saved.', 409);
    if (outcome === 'DONE') await tx.update(rooms).set({ operationalStatus: 'CLEAN', updatedAt: timestamp }).where(and(eq(rooms.id, task.roomId), eq(rooms.propertyId, c.property.id)));
    await audit(tx, c, 'HOUSEKEEPING_OUTCOME_RECORDED', 'HOUSEKEEPING_TASK', id, task, { status, outcome, deferredUntil, version: version + 1 });
    return { taskId: id, status, outcome, deferredUntil, version: version + 1 };
  });
}

async function submitInspection(c: ReservationContext, raw: Record<string, unknown>) {
  const id = String(raw.taskId ?? ''), version = integer(raw.expectedVersion, 'Expected version'), result = String(raw.result ?? '').toUpperCase();
  if (!['NO_DAMAGE', 'DAMAGE_FOUND'].includes(result)) throw new DomainError('INVALID_INSPECTION_RESULT', 'Choose No damage or Damage found.', 400);
  const description = String(raw.description ?? '').trim(), severity = normalizeDamageSeverity(raw.severity ?? 'LOW');
  if (result === 'DAMAGE_FOUND' && (description.length < 5 || !severity)) throw new DomainError('INVALID_DAMAGE_REPORT', 'A description and valid severity are required.', 400);
  return getDb().transaction(async tx => {
    const joined = (await tx.select({ task: housekeepingTasks, folio: folios }).from(housekeepingTasks).innerJoin(folios, eq(folios.reservationId, housekeepingTasks.reservationId)).where(and(eq(housekeepingTasks.id, id), eq(housekeepingTasks.propertyId, c.property.id))).limit(1))[0];
    if (!joined) throw new DomainError('NOT_FOUND', 'Checkout inspection task not found.', 404);
    const { task, folio } = joined;
    if (task.version !== version || task.taskType !== 'CHECKOUT_INSPECTION' || task.status !== 'NEEDS_INSPECTION') throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This inspection is no longer pending.', 409);
    if (!task.reservationId) throw new DomainError('INVALID_INSPECTION_STATE', 'The inspection has no reservation.', 409);
    const policy = result === 'DAMAGE_FOUND' ? (await tx.select().from(damagePolicyRules).where(and(eq(damagePolicyRules.propertyId, c.property.id), eq(damagePolicyRules.severity, severity!), eq(damagePolicyRules.active, true))).limit(1))[0] : null;
    if (result === 'DAMAGE_FOUND' && !policy) throw new DomainError('DAMAGE_POLICY_NOT_CONFIGURED', 'No active damage policy is configured for this severity.', 409);
    const timestamp = now(), inspectionId = crypto.randomUUID(), reportId = result === 'DAMAGE_FOUND' ? crypto.randomUUID() : null;
    await tx.update(housekeepingTasks).set({ status: 'COMPLETED', outcome: result, completedAt: timestamp, updatedAt: timestamp, version: version + 1 }).where(and(eq(housekeepingTasks.id, id), eq(housekeepingTasks.version, version)));
    await tx.insert(roomInspections).values({ id: inspectionId, propertyId: c.property.id, taskId: id, reservationId: task.reservationId, roomId: task.roomId, result, notes: description || null, damageSeverity: result === 'DAMAGE_FOUND' ? severity : null, completedBy: c.actor.name, completedAt: timestamp });
    await tx.update(folios).set({ status: result === 'DAMAGE_FOUND' ? 'PENDING_DAMAGE_REVIEW' : 'OPEN', updatedAt: timestamp, version: folio.version + 1 }).where(eq(folios.id, folio.id));
    if (reportId && policy) {
      await tx.insert(damageReports).values({ id: reportId, propertyId: c.property.id, inspectionId, reservationId: task.reservationId, roomId: task.roomId, folioId: folio.id, description, severity: severity!, status: 'PENDING_REVIEW', policyRuleId: policy.id, policyLabel: policy.label, policyLiabilityPaise: policy.liabilityCapPaise, reportedBy: c.actor.name, reportedAt: timestamp, version: 1 });
      if (policy.roomImpact === 'ROOM_OUT_OF_ORDER') await tx.update(rooms).set({ operationalStatus: 'MAINTENANCE', updatedAt: timestamp }).where(eq(rooms.id, task.roomId));
      if (['ROOM_OUT_OF_ORDER', 'MAINTENANCE_REVIEW'].includes(policy.roomImpact)) await tx.insert(maintenanceTickets).values({ id: `damage-maint-${reportId}`, propertyId: c.property.id, roomId: task.roomId, category: 'ROOM_DAMAGE', issue: description, severity: 'HIGH', status: 'OPEN', openedAt: timestamp });
    }
    if (!policy || policy.roomImpact !== 'ROOM_OUT_OF_ORDER') await tx.insert(housekeepingTasks).values({ id: crypto.randomUUID(), propertyId: c.property.id, roomId: task.roomId, reservationId: task.reservationId, taskType: 'CHECKOUT_CLEANING', priority: 'HIGH', status: 'ASSIGNED', scheduledAt: timestamp, updatedAt: timestamp, version: 1, notes: 'Post-checkout cleaning' });
    await audit(tx, c, 'ROOM_INSPECTION_SUBMITTED', 'ROOM_INSPECTION', inspectionId, null, { taskId: id, result, reportId });
    return { taskId: id, inspectionId, result, damageReportId: reportId };
  });
}

async function resolveDamage(c: ReservationContext, raw: Record<string, unknown>) {
  const id = String(raw.reportId ?? ''), version = integer(raw.expectedVersion, 'Expected version'), decision = String(raw.decision ?? '').toUpperCase();
  if (!['POST_CHARGE', 'WAIVE'].includes(decision)) throw new DomainError('INVALID_DAMAGE_DECISION', 'Choose Post charge or Waive.', 400);
  return getDb().transaction(async tx => {
    const row = (await tx.select({ report: damageReports, folio: folios }).from(damageReports).innerJoin(folios, eq(folios.id, damageReports.folioId)).where(and(eq(damageReports.id, id), eq(damageReports.propertyId, c.property.id))).limit(1))[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Damage report not found.', 404);
    if (row.report.version !== version || row.report.status !== 'PENDING_REVIEW') throw new DomainError('STALE_DAMAGE_REPORT', 'This damage report has already been reviewed.', 409);
    const amount = decision === 'POST_CHARGE' ? calculatePolicyDamageCharge(integer(raw.repairCostPaise ?? raw.amountPaise, 'Repair cost'), Number(row.report.policyLiabilityPaise)) : 0;
    const timestamp = now(), lineId = decision === 'POST_CHARGE' ? `damage-${id}` : null, status = decision === 'POST_CHARGE' ? 'CHARGED' : 'WAIVED';
    await tx.update(damageReports).set({ status, repairCostPaise: decision === 'POST_CHARGE' ? integer(raw.repairCostPaise ?? raw.amountPaise, 'Repair cost') : null, chargeAmountPaise: amount || null, folioLineId: lineId, decisionNote: String(raw.decisionNote ?? '').slice(0, 500) || null, reviewedBy: c.actor.name, reviewedAt: timestamp, version: version + 1 }).where(and(eq(damageReports.id, id), eq(damageReports.version, version)));
    if (lineId) await tx.insert(folioLines).values({ id: lineId, organisationId: c.actor.organisationId, propertyId: c.property.id, folioId: row.folio.id, description: `Room damage: ${row.report.description}`, category: 'DAMAGE', quantity: 1, unitAmountPaise: amount, taxRateBps: 0, lineTotalPaise: amount, subtotalPaise: amount, discountPaise: 0, taxableAmountPaise: amount, taxPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, sourceType: 'DAMAGE_REPORT', sourceId: id, postedBy: c.actor.id, source: 'INSPECTION_REVIEW', createdAt: timestamp });
    await tx.update(folios).set({ status: 'OPEN', subtotalPaise: row.folio.subtotalPaise + amount, taxableAmountPaise: row.folio.taxableAmountPaise + amount, totalPaise: row.folio.totalPaise + amount, outstandingPaise: row.folio.outstandingPaise + amount, updatedAt: timestamp, version: row.folio.version + 1 }).where(eq(folios.id, row.folio.id));
    await audit(tx, c, decision === 'POST_CHARGE' ? 'DAMAGE_CHARGE_POSTED' : 'DAMAGE_CHARGE_WAIVED', 'DAMAGE_REPORT', id, row.report, { status, amount });
    return { reportId: id, status, amountPaise: amount, folioLineId: lineId };
  });
}

async function upsertInventory(c: ReservationContext, raw: Record<string, unknown>) {
  assertRoleCan(c.actor.role, 'inventory.write');
  const id = String(raw.id ?? '').trim(), name = String(raw.name ?? '').trim(), category = String(raw.category ?? '').trim(), unit = String(raw.unit ?? '').trim();
  if (!name || !category || !unit) throw new DomainError('INVALID_INVENTORY_ITEM', 'Name, category and unit are required.', 400);
  const department = c.actor.role === 'RESTAURANT' ? 'RESTAURANT' : String(raw.department ?? 'HOTEL').toUpperCase();
  if (!['HOTEL', 'RESTAURANT'].includes(department)) throw new DomainError('INVALID_INVENTORY_DEPARTMENT', 'Inventory department must be Hotel or Restaurant.', 400);
  const currentQuantity = integer(raw.currentQuantity, 'Current quantity'), minimumQuantity = integer(raw.minimumQuantity, 'Minimum quantity'), unitCostPaise = integer(raw.unitCostPaise, 'Unit cost');
  const db = getDb(), existing = id ? (await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, id), eq(inventoryItems.propertyId, c.property.id))).limit(1))[0] : null;
  if (id && !existing) throw new DomainError('NOT_FOUND', 'Inventory item not found.', 404);
  if (existing && String(raw.expectedUpdatedAt ?? '') !== existing.updatedAt) throw new DomainError('STALE_INVENTORY_ITEM', 'This inventory item was updated by someone else.', 409);
  const timestamp = now(), itemId = existing?.id ?? crypto.randomUUID(), next = { name, category, department, unit, currentQuantity, minimumQuantity, unitCostPaise, updatedAt: timestamp };
  if (existing) await db.update(inventoryItems).set(next).where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.updatedAt, existing.updatedAt)));
  else await db.insert(inventoryItems).values({ id: itemId, propertyId: c.property.id, ...next });
  await audit(db, c, existing ? 'INVENTORY_ITEM_UPDATED' : 'INVENTORY_ITEM_CREATED', 'INVENTORY_ITEM', itemId, existing, next);
  return { item: { id: itemId, ...next } };
}
