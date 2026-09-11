import { roleCan, type AppRole } from '@hotel/shared/domain';

export type HousekeepingStaffOption = { id: string; name: string; role: string };
export function assignmentLabel(task: Record<string, unknown>) { return task.assignedUserId ? 'Reassign housekeeper' : 'Assign housekeeper'; }
export function assignmentState(task: Record<string, unknown>) { return task.assignedTo ? `Assigned to ${String(task.assignedTo)}` : 'Unassigned'; }
export function canManageHousekeepingAssignment(role: AppRole, offline: boolean) { return roleCan(role, 'housekeeping.assign') && !offline; }
export function eligibleHousekeepingStaff(rows: Array<Record<string, unknown>>): HousekeepingStaffOption[] {
  return rows.filter(row => row.role === 'HOUSEKEEPING' && String(row.id ?? '').trim() && String(row.name ?? '').trim()).map(row => ({ id: String(row.id), name: String(row.name), role: 'HOUSEKEEPING' }));
}
export function housekeepingAssignmentCommand(task: Record<string, unknown>, assigneeId: string, surface: string) {
  if (!assigneeId.trim()) throw new Error('Select a housekeeper.');
  return { action: 'ASSIGN_HOUSEKEEPING_TASK', taskId: task.id, assigneeId, expectedVersion: task.version, surface };
}
export async function submitHousekeepingAssignment(input: { task: Record<string, unknown>; assigneeId: string; surface: string; command: (payload: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<void>; notify: (message: string) => void }) {
  try {
    await input.command(housekeepingAssignmentCommand(input.task, input.assigneeId, input.surface));
    await input.refresh();
    input.notify(`Room ${String(input.task.roomNumber)} assignment saved.`);
    return true;
  } catch (cause) {
    input.notify(cause instanceof Error ? cause.message : 'Housekeeping assignment could not be saved.');
    return false;
  }
}
