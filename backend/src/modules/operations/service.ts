import { and, eq, sql } from 'drizzle-orm';

import { inventoryMovements } from '@/db/operational-schema';
import {
  appUsers,
  auditLogs,
  damagePolicyRules,
  damageReports,
  folioLines,
  folios,
  housekeepingTasks,
  inventoryItems,
  maintenanceTickets,
  roomInspections,
  rooms,
} from '@/db/schema';
import { getDb } from '@/db';

import type { ReservationContext } from '@/services/reservations/types';

import {
  assertRoleCan,
  calculatePolicyDamageCharge,
  DomainError,
  normalizeDamageSeverity,
} from '@hotel/shared/domain';

import {
  assertEligibleHousekeeper,
  assertHousekeepingAssignmentActor,
  assertHousekeepingTaskAssignable,
} from './housekeeping-assignment';
import { isWorkflowAction, mutateWorkflow } from './workflows';
import { reconcileReference } from './reconciliation';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const now = () => new Date().toISOString();

function assertPropertyContext(c: ReservationContext) {
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
}

function audit(
  db: Db | Tx,
  c: ReservationContext,
  action: string,
  entity: string,
  entityId: string,
  previousValue: unknown,
  newValue: unknown,
) {
  return db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    timestamp: now(),
    actorId: c.actor.id,
    actorName: c.actor.name,
    role: c.actor.role,
    propertyId: c.property.id,
    deviceId: null,
    action,
    entity,
    entityId,
    previousValue:
      previousValue == null ? null : JSON.stringify(previousValue),
    newValue: newValue == null ? null : JSON.stringify(newValue),
    source: 'PRODUCTION_API',
    correlationId: crypto.randomUUID(),
  });
}

function integer(value: unknown, label: string) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new DomainError(
      'INVALID_INPUT',
      `${label} must be a non-negative whole number.`,
      400,
    );
  }

  return parsed;
}

export async function mutateOperations(
  c: ReservationContext,
  raw: Record<string, unknown>,
) {
  assertPropertyContext(c);

  const action = String(raw.action ?? '');

  if (['REGISTER_OFFLINE_BILL', 'VERIFY_OFFLINE_BILL'].includes(action)) {
    return reconcileReference(c, raw);
  }

  if (action === 'UPSERT_INVENTORY') {
    return upsertInventory(c, raw);
  }

  if (action === 'ASSIGN_HOUSEKEEPING_TASK') {
    return assignHousekeepingTask(c, raw);
  }

  if (
    [
      'CREATE_MAINTENANCE',
      'UPDATE_MAINTENANCE',
      'ASSIGN_MAINTENANCE',
      'START_MAINTENANCE',
      'RESOLVE_MAINTENANCE',
      'CLOSE_MAINTENANCE',
    ].includes(action)
  ) {
    return mutateMaintenance(c, action, raw);
  }

  if (isWorkflowAction(action)) {
    return mutateWorkflow(c, action, raw);
  }


  if (
    ['RECORD_HOUSEKEEPING_OUTCOME', 'SUBMIT_ROOM_INSPECTION'].includes(
      action,
    ) &&
    !['OWNER', 'MANAGER', 'HOUSEKEEPING'].includes(c.actor.role)
  ) {
    throw new DomainError(
      'FORBIDDEN',
      'Housekeeping work is restricted to the assigned housekeeper or management.',
      403,
    );
  }

  assertRoleCan(
    c.actor.role,
    action === 'RESOLVE_DAMAGE_REPORT'
      ? 'damage.review'
      : 'operations.write',
  );

  if (action === 'RECORD_HOUSEKEEPING_OUTCOME') {
    return recordOutcome(c, raw);
  }

  if (action === 'SUBMIT_ROOM_INSPECTION') {
    return submitInspection(c, raw);
  }

  if (action === 'RESOLVE_DAMAGE_REPORT') {
    return resolveDamage(c, raw);
  }

  throw new DomainError(
    'UNKNOWN_OPERATION',
    'Unsupported operations command.',
    400,
  );
}

async function assignHousekeepingTask(
  c: ReservationContext,
  raw: Record<string, unknown>,
) {
  assertHousekeepingAssignmentActor(c.actor.role);

  const taskId = String(raw.taskId ?? '').trim();
  const assigneeId = String(raw.assigneeId ?? '').trim();
  const expectedVersion = integer(raw.expectedVersion, 'Expected version');

  if (!taskId || !assigneeId) {
    throw new DomainError(
      'INVALID_HOUSEKEEPING_ASSIGNMENT',
      'Task and housekeeper are required.',
      400,
    );
  }

  return getDb().transaction(async (tx) => {
    const taskRow = (
      await tx
        .select({
          task: housekeepingTasks,
          roomNumber: rooms.number,
        })
        .from(housekeepingTasks)
        .innerJoin(rooms, eq(rooms.id, housekeepingTasks.roomId))
        .where(
          and(
            eq(housekeepingTasks.id, taskId),
            eq(housekeepingTasks.propertyId, c.property.id),
          ),
        )
        .limit(1)
    )[0];

    if (!taskRow) {
      throw new DomainError(
        'NOT_FOUND',
        'Housekeeping task was not found.',
        404,
      );
    }

    assertHousekeepingTaskAssignable(taskRow.task, expectedVersion);

    const assignee = (
      await tx
        .select({
          id: appUsers.id,
          organisationId: appUsers.organisationId,
          propertyId: appUsers.propertyId,
          role: appUsers.role,
          active: appUsers.active,
          name: appUsers.name,
          displayName: appUsers.displayName,
        })
        .from(appUsers)
        .where(eq(appUsers.id, assigneeId))
        .limit(1)
    )[0];

    assertEligibleHousekeeper(
      assignee,
      c.actor.organisationId,
      c.property.id,
    );

    const assigneeName = assignee.displayName ?? assignee.name;
    const timestamp = now();
    const action = taskRow.task.assignedUserId
      ? 'HOUSEKEEPING_TASK_REASSIGNED'
      : 'HOUSEKEEPING_TASK_ASSIGNED';

    const changed = await tx
      .update(housekeepingTasks)
      .set({
        assignedUserId: assignee.id,
        assignedTo: assigneeName,
        status:
          taskRow.task.status === 'UNASSIGNED'
            ? 'ASSIGNED'
            : taskRow.task.status,
        updatedAt: timestamp,
        version: expectedVersion + 1,
      })
      .where(
        and(
          eq(housekeepingTasks.id, taskId),
          eq(housekeepingTasks.propertyId, c.property.id),
          eq(housekeepingTasks.version, expectedVersion),
        ),
      )
      .returning({ id: housekeepingTasks.id });

    if (!changed.length) {
      throw new DomainError(
        'STALE_HOUSEKEEPING_TASK',
        'This housekeeping task changed before assignment.',
        409,
      );
    }

    await audit(
      tx,
      c,
      action,
      'HOUSEKEEPING_TASK',
      taskId,
      {
        assignedUserId: taskRow.task.assignedUserId,
        assignedTo: taskRow.task.assignedTo,
      },
      {
        assignedUserId: assignee.id,
        assignedTo: assigneeName,
        roomNumber: taskRow.roomNumber,
        version: expectedVersion + 1,
      },
    );

    return {
      taskId,
      assignedUserId: assignee.id,
      assignedTo: assigneeName,
      version: expectedVersion + 1,
    };
  });
}

async function recordOutcome(
  c: ReservationContext,
  raw: Record<string, unknown>,
) {
  const id = String(raw.taskId ?? '');
  const version = integer(raw.expectedVersion, 'Expected version');
  const outcome = String(raw.outcome ?? '').toUpperCase();

  if (!['DONE', 'GUEST_REFUSED', 'COME_LATER'].includes(outcome)) {
    throw new DomainError(
      'INVALID_HOUSEKEEPING_OUTCOME',
      'Choose Done, Guest refused or Come later.',
      400,
    );
  }

  return getDb().transaction(async (tx) => {
    const task = (
      await tx
        .select()
        .from(housekeepingTasks)
        .where(
          and(
            eq(housekeepingTasks.id, id),
            eq(housekeepingTasks.propertyId, c.property.id),
          ),
        )
        .limit(1)
    )[0];

    if (!task) {
      throw new DomainError(
        'NOT_FOUND',
        'Housekeeping task not found.',
        404,
      );
    }

    if (
      c.actor.role === 'HOUSEKEEPING' &&
      task.assignedUserId !== c.actor.id
    ) {
      throw new DomainError(
        'FORBIDDEN',
        'This housekeeping task is not assigned to you.',
        403,
      );
    }

    if (
      task.version !== version ||
      ['COMPLETED', 'CANCELLED'].includes(task.status)
    ) {
      throw new DomainError(
        'STALE_HOUSEKEEPING_TASK',
        'This room task has already changed.',
        409,
      );
    }

    if (!['STAY_SERVICE', 'CHECKOUT_CLEANING'].includes(task.taskType)) {
      throw new DomainError(
        'INSPECTION_REQUIRED',
        'Complete checkout inspections through room inspection.',
        409,
      );
    }

    if (
      task.taskType === 'CHECKOUT_CLEANING' &&
      outcome === 'GUEST_REFUSED'
    ) {
      throw new DomainError(
        'INVALID_HOUSEKEEPING_OUTCOME',
        'Checkout cleaning cannot be refused.',
        409,
      );
    }

    const timestamp = now();
    const deferredUntil =
      outcome === 'COME_LATER' ? String(raw.deferredUntil ?? '') : null;

    if (outcome === 'COME_LATER' && !deferredUntil) {
      throw new DomainError(
        'INVALID_DEFER_TIME',
        'Choose a future return time.',
        400,
      );
    }

    if (
      deferredUntil &&
      (!Number.isFinite(Date.parse(deferredUntil)) ||
        Date.parse(deferredUntil) <= Date.now())
    ) {
      throw new DomainError(
        'INVALID_DEFER_TIME',
        'Choose a future return time.',
        400,
      );
    }

    const status = deferredUntil ? 'DEFERRED' : 'COMPLETED';

    const changed = await tx
      .update(housekeepingTasks)
      .set({
        status,
        outcome,
        deferredUntil,
        scheduledAt: deferredUntil ?? task.scheduledAt,
        completedAt: status === 'COMPLETED' ? timestamp : null,
        updatedAt: timestamp,
        version: version + 1,
      })
      .where(
        and(
          eq(housekeepingTasks.id, id),
          eq(housekeepingTasks.version, version),
        ),
      )
      .returning({ id: housekeepingTasks.id });

    if (!changed.length) {
      throw new DomainError(
        'STALE_HOUSEKEEPING_TASK',
        'This room task changed before it could be saved.',
        409,
      );
    }

    if (outcome === 'DONE') {
      const [room] = await tx
        .select()
        .from(rooms)
        .where(
          and(
            eq(rooms.id, task.roomId),
            eq(rooms.propertyId, c.property.id),
          ),
        )
        .for('update');

      if (
        !room ||
        ['MAINTENANCE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE'].includes(
          room.operationalStatus,
        ) ||
        (task.taskType === 'CHECKOUT_CLEANING' &&
          room.occupancyStatus !== 'VACANT')
      ) {
        throw new DomainError(
          'ROOM_STATE_CHANGED',
          'This room cannot be released by cleaning. Refresh its current status.',
          409,
        );
      }

      if (task.taskType === 'CHECKOUT_CLEANING' && task.reservationId) {
        const pendingInspection = await tx
          .select({ id: housekeepingTasks.id })
          .from(housekeepingTasks)
          .where(
            and(
              eq(housekeepingTasks.reservationId, task.reservationId),
              eq(housekeepingTasks.taskType, 'CHECKOUT_INSPECTION'),
              eq(housekeepingTasks.status, 'NEEDS_INSPECTION'),
            ),
          )
          .limit(1);

        const pendingDamage = await tx
          .select({ id: damageReports.id })
          .from(damageReports)
          .where(
            and(
              eq(damageReports.reservationId, task.reservationId),
              eq(damageReports.propertyId, c.property.id),
              eq(damageReports.status, 'PENDING_REVIEW'),
            ),
          )
          .limit(1);

        if (pendingInspection.length || pendingDamage.length) {
          throw new DomainError(
            'ROOM_REVIEW_PENDING',
            'Complete the inspection and damage review before releasing this room.',
            409,
          );
        }
      }

      await tx
        .update(rooms)
        .set({
          operationalStatus: 'CLEAN',
          version: sql`${rooms.version} + 1`,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(rooms.id, task.roomId),
            eq(rooms.propertyId, c.property.id),
          ),
        );
    }

    await audit(
      tx,
      c,
      'HOUSEKEEPING_OUTCOME_RECORDED',
      'HOUSEKEEPING_TASK',
      id,
      task,
      {
        status,
        outcome,
        deferredUntil,
        version: version + 1,
      },
    );

    return {
      taskId: id,
      status,
      outcome,
      deferredUntil,
      version: version + 1,
    };
  });
}

async function submitInspection(
  c: ReservationContext,
  raw: Record<string, unknown>,
) {
  const id = String(raw.taskId ?? '');
  const version = integer(raw.expectedVersion, 'Expected version');
  const result = String(raw.result ?? '').toUpperCase();

  if (!['NO_DAMAGE', 'DAMAGE_FOUND'].includes(result)) {
    throw new DomainError(
      'INVALID_INSPECTION_RESULT',
      'Choose No damage or Damage found.',
      400,
    );
  }

  const description = String(raw.description ?? '').trim();
  const severity = normalizeDamageSeverity(raw.severity ?? 'LOW');

  if (result === 'DAMAGE_FOUND' && (description.length < 5 || !severity)) {
    throw new DomainError(
      'INVALID_DAMAGE_REPORT',
      'A description and valid severity are required.',
      400,
    );
  }

  return getDb().transaction(async (tx) => {
    const [key] = await tx
      .select({ id: folios.id })
      .from(housekeepingTasks)
      .innerJoin(
        folios,
        eq(folios.reservationId, housekeepingTasks.reservationId),
      )
      .where(
        and(
          eq(housekeepingTasks.id, id),
          eq(housekeepingTasks.propertyId, c.property.id),
          eq(folios.propertyId, c.property.id),
        ),
      )
      .limit(1);

    if (!key) {
      throw new DomainError(
        'NOT_FOUND',
        'Checkout inspection task not found.',
        404,
      );
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`folio:${key.id}`}))`,
    );

    const joined = (
      await tx
        .select({
          task: housekeepingTasks,
          folio: folios,
        })
        .from(housekeepingTasks)
        .innerJoin(
          folios,
          eq(folios.reservationId, housekeepingTasks.reservationId),
        )
        .where(
          and(
            eq(housekeepingTasks.id, id),
            eq(housekeepingTasks.propertyId, c.property.id),
            eq(folios.propertyId, c.property.id),
          ),
        )
        .limit(1)
        .for('update')
    )[0];

    if (!joined) {
      throw new DomainError(
        'NOT_FOUND',
        'Checkout inspection task not found.',
        404,
      );
    }

    const { task, folio } = joined;

    if (['CLOSED', 'VOID'].includes(folio.status)) {
      throw new DomainError(
        'FOLIO_CLOSED',
        'This folio can no longer be changed by an inspection.',
        409,
      );
    }

    if (
      c.actor.role === 'HOUSEKEEPING' &&
      task.assignedUserId !== c.actor.id
    ) {
      throw new DomainError(
        'FORBIDDEN',
        'This housekeeping task is not assigned to you.',
        403,
      );
    }

    if (
      task.version !== version ||
      task.taskType !== 'CHECKOUT_INSPECTION' ||
      task.status !== 'NEEDS_INSPECTION'
    ) {
      throw new DomainError(
        'STALE_HOUSEKEEPING_TASK',
        'This inspection is no longer pending.',
        409,
      );
    }

    if (!task.reservationId) {
      throw new DomainError(
        'INVALID_INSPECTION_STATE',
        'The inspection has no reservation.',
        409,
      );
    }

    const policy =
      result === 'DAMAGE_FOUND'
        ? (
            await tx
              .select()
              .from(damagePolicyRules)
              .where(
                and(
                  eq(damagePolicyRules.propertyId, c.property.id),
                  eq(damagePolicyRules.severity, severity!),
                  eq(damagePolicyRules.active, true),
                ),
              )
              .limit(1)
          )[0]
        : null;

    if (result === 'DAMAGE_FOUND' && !policy) {
      throw new DomainError(
        'DAMAGE_POLICY_NOT_CONFIGURED',
        'No active damage policy is configured for this severity.',
        409,
      );
    }

    const timestamp = now();
    const inspectionId = crypto.randomUUID();
    const reportId =
      result === 'DAMAGE_FOUND' ? crypto.randomUUID() : null;

    const changedTask = await tx
      .update(housekeepingTasks)
      .set({
        status: 'COMPLETED',
        outcome: result,
        completedAt: timestamp,
        updatedAt: timestamp,
        version: version + 1,
      })
      .where(
        and(
          eq(housekeepingTasks.id, id),
          eq(housekeepingTasks.version, version),
        ),
      )
      .returning({ id: housekeepingTasks.id });

    if (!changedTask.length) {
      throw new DomainError(
        'STALE_HOUSEKEEPING_TASK',
        'This inspection changed before it could be submitted.',
        409,
      );
    }

    await tx.insert(roomInspections).values({
      id: inspectionId,
      propertyId: c.property.id,
      taskId: id,
      reservationId: task.reservationId,
      roomId: task.roomId,
      result,
      notes: description || null,
      damageSeverity: result === 'DAMAGE_FOUND' ? severity : null,
      completedBy: c.actor.name,
      completedAt: timestamp,
    });

    await tx
      .update(folios)
      .set({
        status:
          result === 'DAMAGE_FOUND'
            ? 'PENDING_DAMAGE_REVIEW'
            : 'CHECKOUT_READY',
        updatedAt: timestamp,
        version: folio.version + 1,
      })
      .where(
        and(
          eq(folios.id, folio.id),
          eq(folios.version, folio.version),
        ),
      );

    if (reportId && policy) {
      await tx.insert(damageReports).values({
        id: reportId,
        propertyId: c.property.id,
        inspectionId,
        reservationId: task.reservationId,
        roomId: task.roomId,
        folioId: folio.id,
        description,
        severity: severity!,
        status: 'PENDING_REVIEW',
        policyRuleId: policy.id,
        policyLabel: policy.label,
        policyLiabilityPaise: policy.liabilityCapPaise,
        reportedBy: c.actor.name,
        reportedAt: timestamp,
        version: 1,
      });

      if (policy.roomImpact === 'ROOM_OUT_OF_ORDER') {
        await tx
          .update(rooms)
          .set({
            operationalStatus: 'MAINTENANCE',
            version: sql`${rooms.version} + 1`,
            updatedAt: timestamp,
          })
          .where(eq(rooms.id, task.roomId));
      }

      if (
        ['ROOM_OUT_OF_ORDER', 'MAINTENANCE_REVIEW'].includes(
          policy.roomImpact,
        )
      ) {
        await tx.insert(maintenanceTickets).values({
          id: `damage-maint-${reportId}`,
          propertyId: c.property.id,
          roomId: task.roomId,
          category: 'ROOM_DAMAGE',
          issue: description,
          severity: 'HIGH',
          status: 'OPEN',
          openedAt: timestamp,
        });
      }
    }

    if (!policy || policy.roomImpact !== 'ROOM_OUT_OF_ORDER') {
      await tx
        .insert(housekeepingTasks)
        .values({
          id: crypto.randomUUID(),
          propertyId: c.property.id,
          roomId: task.roomId,
          reservationId: task.reservationId,
          taskType: 'CHECKOUT_CLEANING',
          priority: 'HIGH',
          status: 'UNASSIGNED',
          scheduledAt: timestamp,
          updatedAt: timestamp,
          version: 1,
          notes: 'Post-checkout cleaning',
        })
        .onConflictDoNothing();
    }

    await audit(
      tx,
      c,
      'ROOM_INSPECTION_SUBMITTED',
      'ROOM_INSPECTION',
      inspectionId,
      null,
      {
        taskId: id,
        result,
        reportId,
        folioStatus:
          result === 'DAMAGE_FOUND'
            ? 'PENDING_DAMAGE_REVIEW'
            : 'CHECKOUT_READY',
      },
    );

    return {
      taskId: id,
      inspectionId,
      result,
      damageReportId: reportId,
    };
  });
}

async function resolveDamage(
  c: ReservationContext,
  raw: Record<string, unknown>,
) {
  const id = String(raw.reportId ?? '');
  const version = integer(raw.expectedVersion, 'Expected version');
  const decision = String(raw.decision ?? '').toUpperCase();

  if (!['POST_CHARGE', 'WAIVE'].includes(decision)) {
    throw new DomainError(
      'INVALID_DAMAGE_DECISION',
      'Choose Post charge or Waive.',
      400,
    );
  }

  return getDb().transaction(async (tx) => {
    const [key] = await tx
      .select({ id: damageReports.folioId })
      .from(damageReports)
      .where(
        and(
          eq(damageReports.id, id),
          eq(damageReports.propertyId, c.property.id),
        ),
      )
      .limit(1);

    if (!key) {
      throw new DomainError(
        'NOT_FOUND',
        'Damage report not found.',
        404,
      );
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`folio:${key.id}`}))`,
    );

    const row = (
      await tx
        .select({
          report: damageReports,
          folio: folios,
        })
        .from(damageReports)
        .innerJoin(folios, eq(folios.id, damageReports.folioId))
        .where(
          and(
            eq(damageReports.id, id),
            eq(damageReports.propertyId, c.property.id),
            eq(folios.propertyId, c.property.id),
          ),
        )
        .limit(1)
        .for('update')
    )[0];

    if (!row) {
      throw new DomainError(
        'NOT_FOUND',
        'Damage report not found.',
        404,
      );
    }

    if (['CLOSED', 'VOID'].includes(row.folio.status)) {
      throw new DomainError(
        'FOLIO_CLOSED',
        'This folio is closed. Use the billing correction workflow.',
        409,
      );
    }

    if (
      row.report.version !== version ||
      row.report.status !== 'PENDING_REVIEW'
    ) {
      throw new DomainError(
        'STALE_DAMAGE_REPORT',
        'This damage report has already been reviewed.',
        409,
      );
    }

    const repairCostPaise =
      decision === 'POST_CHARGE'
        ? integer(
            raw.repairCostPaise ?? raw.amountPaise,
            'Repair cost',
          )
        : 0;

    const amount =
      decision === 'POST_CHARGE'
        ? calculatePolicyDamageCharge(
            repairCostPaise,
            Number(row.report.policyLiabilityPaise),
          )
        : 0;

    const timestamp = now();
    const lineId = decision === 'POST_CHARGE' ? `damage-${id}` : null;
    const status = decision === 'POST_CHARGE' ? 'CHARGED' : 'WAIVED';

    const changedReport = await tx
      .update(damageReports)
      .set({
        status,
        repairCostPaise:
          decision === 'POST_CHARGE' ? repairCostPaise : null,
        chargeAmountPaise: amount || null,
        folioLineId: lineId,
        decisionNote:
          String(raw.decisionNote ?? '').slice(0, 500) || null,
        reviewedBy: c.actor.name,
        reviewedAt: timestamp,
        version: version + 1,
      })
      .where(
        and(
          eq(damageReports.id, id),
          eq(damageReports.version, version),
        ),
      )
      .returning({ id: damageReports.id });

    if (!changedReport.length) {
      throw new DomainError(
        'STALE_DAMAGE_REPORT',
        'This damage report changed before review could be saved.',
        409,
      );
    }

    if (lineId) {
      await tx.insert(folioLines).values({
        id: lineId,
        organisationId: c.actor.organisationId,
        propertyId: c.property.id,
        folioId: row.folio.id,
        description: `Room damage: ${row.report.description}`,
        category: 'DAMAGE',
        quantity: 1,
        unitAmountPaise: amount,
        taxRateBps: 0,
        lineTotalPaise: amount,
        subtotalPaise: amount,
        discountPaise: 0,
        taxableAmountPaise: amount,
        taxPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
        sourceType: 'DAMAGE_REPORT',
        sourceId: id,
        postedBy: c.actor.id,
        source: 'INSPECTION_REVIEW',
        createdAt: timestamp,
      });
    }

    await tx
      .update(folios)
      .set({
        status: 'CHECKOUT_READY',
        subtotalPaise: row.folio.subtotalPaise + amount,
        taxableAmountPaise: row.folio.taxableAmountPaise + amount,
        totalPaise: row.folio.totalPaise + amount,
        outstandingPaise: row.folio.outstandingPaise + amount,
        updatedAt: timestamp,
        version: row.folio.version + 1,
      })
      .where(
        and(
          eq(folios.id, row.folio.id),
          eq(folios.version, row.folio.version),
        ),
      );

    await audit(
      tx,
      c,
      decision === 'POST_CHARGE'
        ? 'DAMAGE_CHARGE_POSTED'
        : 'DAMAGE_CHARGE_WAIVED',
      'DAMAGE_REPORT',
      id,
      row.report,
      {
        status,
        amount,
        folioStatus: 'CHECKOUT_READY',
      },
    );

    return {
      reportId: id,
      status,
      amountPaise: amount,
      folioLineId: lineId,
    };
  });
}

async function upsertInventory(
  c: ReservationContext,
  raw: Record<string, unknown>,
) {
  assertRoleCan(c.actor.role, 'inventory.write');

  const id = String(raw.id ?? '').trim();
  const name = String(raw.name ?? '').trim();
  const category = String(raw.category ?? '').trim();
  const unit = String(raw.unit ?? '').trim();

  if (!name || !category || !unit) {
    throw new DomainError(
      'INVALID_INVENTORY_ITEM',
      'Name, category and unit are required.',
      400,
    );
  }

  const department =
    c.actor.role === 'RESTAURANT'
      ? 'RESTAURANT'
      : String(raw.department ?? 'HOTEL').toUpperCase();

  if (!['HOTEL', 'RESTAURANT'].includes(department)) {
    throw new DomainError(
      'INVALID_INVENTORY_DEPARTMENT',
      'Inventory department must be Hotel or Restaurant.',
      400,
    );
  }

  const currentQuantity = integer(raw.currentQuantity, 'Current quantity');
  const minimumQuantity = integer(raw.minimumQuantity, 'Minimum quantity');
  const unitCostPaise = integer(raw.unitCostPaise, 'Unit cost');

  return getDb().transaction(async (db) => {
    const existing = id
      ? (
          await db
            .select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.id, id),
                eq(inventoryItems.propertyId, c.property.id),
                c.actor.role === 'RESTAURANT'
                  ? eq(inventoryItems.department, 'RESTAURANT')
                  : undefined,
              ),
            )
            .for('update')
        )[0]
      : null;

    if (id && !existing) {
      throw new DomainError(
        'NOT_FOUND',
        'Inventory item not found.',
        404,
      );
    }

    if (
      existing &&
      String(raw.expectedUpdatedAt ?? '') !== existing.updatedAt
    ) {
      throw new DomainError(
        'STALE_INVENTORY_ITEM',
        'This inventory item was updated by someone else.',
        409,
      );
    }

    const timestamp = now();
    const itemId = existing?.id ?? crypto.randomUUID();
    const next = {
      name,
      category,
      department,
      unit,
      currentQuantity,
      minimumQuantity,
      unitCostPaise,
      updatedAt: timestamp,
    };

    if (existing) {
      const changed = await db
        .update(inventoryItems)
        .set(next)
        .where(
          and(
            eq(inventoryItems.id, itemId),
            eq(inventoryItems.updatedAt, existing.updatedAt),
          ),
        )
        .returning({ id: inventoryItems.id });

      if (!changed.length) {
        throw new DomainError(
          'STALE_INVENTORY_ITEM',
          'This inventory item changed before it could be saved.',
          409,
        );
      }
    } else {
      await db.insert(inventoryItems).values({
        id: itemId,
        propertyId: c.property.id,
        ...next,
      });
    }

    const delta = currentQuantity - (existing?.currentQuantity ?? 0);

    if (delta !== 0) {
      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        propertyId: c.property.id,
        itemId,
        delta,
        balance: currentQuantity,
        reason: existing
          ? 'Inventory count adjustment'
          : 'Opening stock',
        actorId: c.actor.id,
        actorName: c.actor.name,
        createdAt: timestamp,
      });
    }

    await audit(
      db,
      c,
      existing ? 'INVENTORY_ITEM_UPDATED' : 'INVENTORY_ITEM_CREATED',
      'INVENTORY_ITEM',
      itemId,
      existing,
      next,
    );

    return {
      item: {
        id: itemId,
        ...next,
      },
    };
  });
}

function assertMaintenanceActor(c: ReservationContext) {
  if (!['OWNER', 'MANAGER'].includes(c.actor.role)) {
    throw new DomainError(
      'FORBIDDEN',
      'Maintenance management is restricted to owners and managers.',
      403,
    );
  }

  assertRoleCan(c.actor.role, 'operations.write');
}

function maintenanceCategory(value: unknown) {
  const category = String(value ?? '')
    .trim()
    .toUpperCase()
    .replaceAll(' ', '_');

  const allowed = [
    'HVAC',
    'PLUMBING',
    'ELECTRICAL',
    'FURNITURE',
    'ROOM_DAMAGE',
    'SAFETY',
    'OTHER',
  ];

  if (!allowed.includes(category)) {
    throw new DomainError(
      'INVALID_MAINTENANCE_CATEGORY',
      'Choose a valid maintenance category.',
      400,
    );
  }

  return category;
}

function maintenanceSeverity(value: unknown) {
  const severity = normalizeDamageSeverity(value);

  if (!severity) {
    throw new DomainError(
      'INVALID_MAINTENANCE_SEVERITY',
      'Choose a valid maintenance severity.',
      400,
    );
  }

  return severity;
}

function maintenanceAssignee(value: unknown) {
  const assignedTo = String(value ?? '').trim();

  if (assignedTo.length > 120) {
    throw new DomainError(
      'INVALID_MAINTENANCE_ASSIGNEE',
      'Assigned technician name is too long.',
      400,
    );
  }

  return assignedTo || null;
}

function maintenanceIssue(value: unknown) {
  const issue = String(value ?? '').trim();

  if (issue.length < 5 || issue.length > 1000) {
    throw new DomainError(
      'INVALID_MAINTENANCE_ISSUE',
      'Maintenance issue must be between 5 and 1000 characters.',
      400,
    );
  }

  return issue;
}

async function maintenanceRoom(
  tx: Tx,
  c: ReservationContext,
  roomId: string | null,
) {
  if (!roomId) return null;

  const room = (
    await tx
      .select()
      .from(rooms)
      .where(
        and(
          eq(rooms.id, roomId),
          eq(rooms.propertyId, c.property.id),
          eq(rooms.active, true),
        ),
      )
      .limit(1)
      .for('update')
  )[0];

  if (!room) {
    throw new DomainError(
      'ROOM_NOT_FOUND',
      'Maintenance room was not found in this property.',
      404,
    );
  }

  return room;
}

async function blockRoomForMaintenance(
  tx: Tx,
  c: ReservationContext,
  roomId: string | null,
  shouldBlock: boolean,
  timestamp: string,
) {
  if (!roomId || !shouldBlock) return null;

  const room = await maintenanceRoom(tx, c, roomId);

  if (!room) return null;

  if (
    !['MAINTENANCE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE'].includes(
      room.operationalStatus,
    )
  ) {
    const changed = await tx
      .update(rooms)
      .set({
        operationalStatus: 'MAINTENANCE',
        updatedAt: timestamp,
        version: room.version + 1,
      })
      .where(
        and(
          eq(rooms.id, room.id),
          eq(rooms.propertyId, c.property.id),
          eq(rooms.version, room.version),
        ),
      )
      .returning({ id: rooms.id });

    if (!changed.length) {
      throw new DomainError(
        'ROOM_STATE_CHANGED',
        'Room status changed before maintenance could block it.',
        409,
      );
    }
  }

  return room;
}

async function releaseResolvedMaintenanceRoom(
  tx: Tx,
  c: ReservationContext,
  ticket: typeof maintenanceTickets.$inferSelect,
  timestamp: string,
) {
  if (!ticket.roomId) return null;

  const room = await maintenanceRoom(tx, c, ticket.roomId);

  const remaining = await tx
    .select({ id: maintenanceTickets.id })
    .from(maintenanceTickets)
    .where(
      and(
        eq(maintenanceTickets.propertyId, c.property.id),
        eq(maintenanceTickets.roomId, ticket.roomId),
        sql`${maintenanceTickets.id} <> ${ticket.id}`,
        sql`${maintenanceTickets.status} in ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      ),
    )
    .limit(1);

  if (remaining.length) {
    return {
      roomReleased: false,
      reason: 'OTHER_ACTIVE_MAINTENANCE',
    };
  }

  if (!room || room.operationalStatus !== 'MAINTENANCE') {
    return {
      roomReleased: false,
      reason: 'ROOM_NOT_MAINTENANCE',
    };
  }

  const nextOperationalStatus =
    room.occupancyStatus === 'VACANT' ? 'VACANT_DIRTY' : 'DIRTY';

  const changedRoom = await tx
    .update(rooms)
    .set({
      operationalStatus: nextOperationalStatus,
      updatedAt: timestamp,
      version: room.version + 1,
    })
    .where(
      and(
        eq(rooms.id, room.id),
        eq(rooms.propertyId, c.property.id),
        eq(rooms.version, room.version),
      ),
    )
    .returning({ id: rooms.id });

  if (!changedRoom.length) {
    throw new DomainError(
      'ROOM_STATE_CHANGED',
      'Room status changed before maintenance resolution could release it.',
      409,
    );
  }

  let housekeepingTaskId: string | null = null;

  const [activeCleaning] = await tx.select({id:housekeepingTasks.id}).from(housekeepingTasks).where(and(eq(housekeepingTasks.propertyId,c.property.id),eq(housekeepingTasks.roomId,room.id),sql`${housekeepingTasks.taskType} in ('STAY_SERVICE','CHECKOUT_CLEANING')`,sql`${housekeepingTasks.status} in ('UNASSIGNED','ASSIGNED','PENDING','DEFERRED')`)).limit(1);
  if (activeCleaning) housekeepingTaskId = activeCleaning.id;
  else {
    housekeepingTaskId = crypto.randomUUID();

    await tx.insert(housekeepingTasks).values({
      id: housekeepingTaskId,
      propertyId: c.property.id,
      roomId: room.id,
      reservationId: null,
      assignedTo: null,
      assignedUserId: null,
      taskType: room.occupancyStatus === 'VACANT' ? 'CHECKOUT_CLEANING' : 'STAY_SERVICE',
      priority: ticket.severity === 'HIGH' ? 'HIGH' : 'NORMAL',
      status: 'UNASSIGNED',
      outcome: null,
      scheduledAt: timestamp,
      deferredUntil: null,
      completedAt: null,
      updatedAt: timestamp,
      version: 1,
      notes: `Post-maintenance clean after ${ticket.id}: ${ticket.issue}`,
    });
  }

  return {
    roomReleased: true,
    roomId: room.id,
    roomNumber: room.number,
    operationalStatus: nextOperationalStatus,
    housekeepingTaskId,
  };
}

async function mutateMaintenance(
  c: ReservationContext,
  action: string,
  raw: Record<string, unknown>,
) {
  assertMaintenanceActor(c);

  if (action === 'CREATE_MAINTENANCE') {
    const roomId = String(raw.roomId ?? '').trim() || null;
    const issue = maintenanceIssue(raw.issue);
    const category = maintenanceCategory(raw.category);
    const severity = maintenanceSeverity(raw.severity ?? 'LOW');
    const assignedTo = maintenanceAssignee(raw.assignedTo);
    const blockRoom = raw.blockRoom === true;
    const timestamp = now();

    return getDb().transaction(async (tx) => {
      const room = await maintenanceRoom(tx, c, roomId);
      const id = crypto.randomUUID();
      const status = assignedTo ? 'ASSIGNED' : 'OPEN';

      await tx.insert(maintenanceTickets).values({
        id,
        propertyId: c.property.id,
        roomId,
        category,
        issue,
        severity,
        assignedTo,
        status,
        openedAt: timestamp,
        version: 1,
      });

      await blockRoomForMaintenance(
        tx,
        c,
        roomId,
        blockRoom,
        timestamp,
      );

      const created = {
        id,
        propertyId: c.property.id,
        roomId,
        roomNumber: room?.number ?? null,
        category,
        issue,
        severity,
        assignedTo,
        status,
        openedAt: timestamp,
        version: 1,
        roomBlocked: Boolean(roomId && blockRoom),
      };

      await audit(
        tx,
        c,
        'MAINTENANCE_TICKET_CREATED',
        'MAINTENANCE_TICKET',
        id,
        null,
        created,
      );

      return { ticket: created };
    });
  }

  const id = String(raw.ticketId ?? raw.id ?? '').trim();
  const expectedVersion = integer(raw.expectedVersion, 'Expected version');

  if (!id) {
    throw new DomainError(
      'INVALID_MAINTENANCE_TICKET',
      'Maintenance ticket is required.',
      400,
    );
  }

  return getDb().transaction(async (tx) => {
    const ticket = (
      await tx
        .select()
        .from(maintenanceTickets)
        .where(
          and(
            eq(maintenanceTickets.id, id),
            eq(maintenanceTickets.propertyId, c.property.id),
          ),
        )
        .limit(1)
        .for('update')
    )[0];

    if (!ticket) {
      throw new DomainError(
        'NOT_FOUND',
        'Maintenance ticket was not found.',
        404,
      );
    }

    if (ticket.version !== expectedVersion) {
      throw new DomainError(
        'STALE_MAINTENANCE_TICKET',
        'This maintenance ticket changed before your update was saved.',
        409,
      );
    }

    const timestamp = now();

    if (action === 'UPDATE_MAINTENANCE') {
      if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
        throw new DomainError(
          'MAINTENANCE_TICKET_LOCKED',
          'Resolved or closed maintenance tickets cannot be edited.',
          409,
        );
      }

      const issue = maintenanceIssue(raw.issue);
      const category = maintenanceCategory(raw.category);
      const severity = maintenanceSeverity(raw.severity ?? ticket.severity);
      const assignedTo = maintenanceAssignee(raw.assignedTo);
      const blockRoom = raw.blockRoom === true;

      let status = ticket.status;

      if (ticket.status === 'OPEN' && assignedTo) status = 'ASSIGNED';
      if (ticket.status === 'ASSIGNED' && !assignedTo) status = 'OPEN';

      const changed = await tx
        .update(maintenanceTickets)
        .set({
          issue,
          category,
          severity,
          assignedTo,
          status,
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(maintenanceTickets.id, id),
            eq(maintenanceTickets.propertyId, c.property.id),
            eq(maintenanceTickets.version, expectedVersion),
          ),
        )
        .returning({ id: maintenanceTickets.id });

      if (!changed.length) {
        throw new DomainError(
          'STALE_MAINTENANCE_TICKET',
          'This maintenance ticket changed before it could be saved.',
          409,
        );
      }

      await blockRoomForMaintenance(
        tx,
        c,
        ticket.roomId,
        blockRoom,
        timestamp,
      );

      const next = {
        ...ticket,
        issue,
        category,
        severity,
        assignedTo,
        status,
        version: expectedVersion + 1,
        roomBlocked: Boolean(ticket.roomId && blockRoom),
      };

      await audit(
        tx,
        c,
        'MAINTENANCE_TICKET_UPDATED',
        'MAINTENANCE_TICKET',
        id,
        ticket,
        next,
      );

      return { ticket: next };
    }

    if (action === 'ASSIGN_MAINTENANCE') {
      if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
        throw new DomainError(
          'MAINTENANCE_TICKET_LOCKED',
          'Resolved or closed maintenance tickets cannot be assigned.',
          409,
        );
      }

      const assignedTo = maintenanceAssignee(raw.assignedTo);

      if (!assignedTo) {
        throw new DomainError(
          'INVALID_MAINTENANCE_ASSIGNEE',
          'Enter a technician or staff name.',
          400,
        );
      }

      const status = ticket.status === 'OPEN' ? 'ASSIGNED' : ticket.status;

      const changed = await tx
        .update(maintenanceTickets)
        .set({
          assignedTo,
          status,
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(maintenanceTickets.id, id),
            eq(maintenanceTickets.propertyId, c.property.id),
            eq(maintenanceTickets.version, expectedVersion),
          ),
        )
        .returning({ id: maintenanceTickets.id });

      if (!changed.length) {
        throw new DomainError(
          'STALE_MAINTENANCE_TICKET',
          'This maintenance ticket changed before assignment.',
          409,
        );
      }

      const next = {
        ...ticket,
        assignedTo,
        status,
        version: expectedVersion + 1,
      };

      await audit(
        tx,
        c,
        'MAINTENANCE_TICKET_ASSIGNED',
        'MAINTENANCE_TICKET',
        id,
        ticket,
        next,
      );

      return { ticket: next };
    }

    if (action === 'START_MAINTENANCE') {
      if (!['OPEN', 'ASSIGNED'].includes(ticket.status)) {
        throw new DomainError(
          'INVALID_MAINTENANCE_STATUS',
          'Only open or assigned maintenance tickets can be started.',
          409,
        );
      }

      const changed = await tx
        .update(maintenanceTickets)
        .set({
          status: 'IN_PROGRESS',
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(maintenanceTickets.id, id),
            eq(maintenanceTickets.propertyId, c.property.id),
            eq(maintenanceTickets.version, expectedVersion),
          ),
        )
        .returning({ id: maintenanceTickets.id });

      if (!changed.length) {
        throw new DomainError(
          'STALE_MAINTENANCE_TICKET',
          'This maintenance ticket changed before work could start.',
          409,
        );
      }

      const next = {
        ...ticket,
        status: 'IN_PROGRESS',
        version: expectedVersion + 1,
      };

      await audit(
        tx,
        c,
        'MAINTENANCE_TICKET_STARTED',
        'MAINTENANCE_TICKET',
        id,
        ticket,
        next,
      );

      return { ticket: next };
    }

    if (action === 'RESOLVE_MAINTENANCE') {
      if (!['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(ticket.status)) {
        throw new DomainError(
          'INVALID_MAINTENANCE_STATUS',
          'Only active maintenance tickets can be resolved.',
          409,
        );
      }

      const resolutionNote = String(raw.resolutionNote ?? '').trim();

      if (resolutionNote.length < 3 || resolutionNote.length > 1000) {
        throw new DomainError(
          'INVALID_MAINTENANCE_RESOLUTION',
          'Enter a short resolution note.',
          400,
        );
      }

      const changed = await tx
        .update(maintenanceTickets)
        .set({
          status: 'RESOLVED',
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(maintenanceTickets.id, id),
            eq(maintenanceTickets.propertyId, c.property.id),
            eq(maintenanceTickets.version, expectedVersion),
          ),
        )
        .returning({ id: maintenanceTickets.id });

      if (!changed.length) {
        throw new DomainError(
          'STALE_MAINTENANCE_TICKET',
          'This maintenance ticket changed before resolution.',
          409,
        );
      }

      const roomRelease = await releaseResolvedMaintenanceRoom(
        tx,
        c,
        ticket,
        timestamp,
      );

      const next = {
        ...ticket,
        status: 'RESOLVED',
        version: expectedVersion + 1,
        resolutionNote,
        roomRelease,
      };

      await audit(
        tx,
        c,
        'MAINTENANCE_TICKET_RESOLVED',
        'MAINTENANCE_TICKET',
        id,
        ticket,
        next,
      );

      return {
        ticket: next,
        roomRelease,
      };
    }

    if (action === 'CLOSE_MAINTENANCE') {
      if (ticket.status !== 'RESOLVED') {
        throw new DomainError(
          'INVALID_MAINTENANCE_STATUS',
          'Resolve the maintenance ticket before closing it.',
          409,
        );
      }

      const changed = await tx
        .update(maintenanceTickets)
        .set({
          status: 'CLOSED',
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(maintenanceTickets.id, id),
            eq(maintenanceTickets.propertyId, c.property.id),
            eq(maintenanceTickets.version, expectedVersion),
          ),
        )
        .returning({ id: maintenanceTickets.id });

      if (!changed.length) {
        throw new DomainError(
          'STALE_MAINTENANCE_TICKET',
          'This maintenance ticket changed before closure.',
          409,
        );
      }

      const closeNote = String(raw.closeNote ?? '').trim().slice(0, 500);
      const next = {
        ...ticket,
        status: 'CLOSED',
        version: expectedVersion + 1,
        closeNote: closeNote || null,
      };

      await audit(
        tx,
        c,
        'MAINTENANCE_TICKET_CLOSED',
        'MAINTENANCE_TICKET',
        id,
        ticket,
        next,
      );

      return { ticket: next };
    }

    throw new DomainError(
      'UNKNOWN_MAINTENANCE_OPERATION',
      'Unsupported maintenance operation.',
      400,
    );
  });
}

