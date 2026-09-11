import { assertRoleCan, DomainError, type AppRole } from '@hotel/shared/domain';

export type AssignmentTask = { status: string; version: number };
export type AssignmentUser = { id: string; organisationId: string; propertyId: string | null; role: string; active: boolean };

export function assertHousekeepingAssignmentActor(role: AppRole) { assertRoleCan(role, 'housekeeping.assign'); }
export function assertHousekeepingTaskAssignable(task: AssignmentTask, expectedVersion: number) {
  if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new DomainError('HOUSEKEEPING_TASK_NOT_ASSIGNABLE', 'Completed or cancelled housekeeping tasks cannot be assigned.', 409);
  if (task.version !== expectedVersion) throw new DomainError('STALE_HOUSEKEEPING_TASK', 'This housekeeping task was updated by someone else.', 409);
}
export function assertEligibleHousekeeper(user: AssignmentUser | undefined, organisationId: string, propertyId: string) {
  if (!user || !user.active || user.organisationId !== organisationId || user.propertyId !== propertyId || user.role !== 'HOUSEKEEPING') throw new DomainError('INVALID_HOUSEKEEPING_ASSIGNEE', 'Choose an active housekeeping employee assigned to this property.', 400);
}
