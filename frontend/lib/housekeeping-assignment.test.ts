import { describe, expect, it, vi } from 'vitest';
import { assignmentLabel, assignmentState, canManageHousekeepingAssignment, eligibleHousekeepingStaff, housekeepingAssignmentCommand, submitHousekeepingAssignment } from './housekeeping-assignment';

describe('housekeeping assignment presentation',()=>{
  it('shows Unassigned without an assignee',()=>expect(assignmentState({})).toBe('Unassigned'));
  it('shows the assigned employee',()=>expect(assignmentState({assignedTo:'Rahul Sharma'})).toBe('Assigned to Rahul Sharma'));
  it('labels initial assignment',()=>expect(assignmentLabel({})).toBe('Assign housekeeper'));
  it('labels reassignment',()=>expect(assignmentLabel({assignedUserId:'staff-a'})).toBe('Reassign housekeeper'));
  it.each(['OWNER','MANAGER','RECEPTION'] as const)('shows controls for %s',role=>expect(canManageHousekeepingAssignment(role,false)).toBe(true));
  it.each(['HOUSEKEEPING','RESTAURANT','ACCOUNTS'] as const)('hides controls for %s',role=>expect(canManageHousekeepingAssignment(role,false)).toBe(false));
  it('hides assignment while offline',()=>expect(canManageHousekeepingAssignment('MANAGER',true)).toBe(false));
});
describe('housekeeping staff selector',()=>{
  const staff=[{id:'h1',name:'Rahul',role:'HOUSEKEEPING'},{id:'m1',name:'Manager',role:'MANAGER'},{id:'',name:'Missing',role:'HOUSEKEEPING'}];
  it('keeps only eligible housekeeping options',()=>expect(eligibleHousekeepingStaff(staff)).toEqual([{id:'h1',name:'Rahul',role:'HOUSEKEEPING'}]));
  it('handles an empty directory',()=>expect(eligibleHousekeepingStaff([])).toEqual([]));
  it('builds the authoritative command fields',()=>expect(housekeepingAssignmentCommand({id:'task-a',version:4},'h1','PROPERTY')).toEqual({action:'ASSIGN_HOUSEKEEPING_TASK',taskId:'task-a',assigneeId:'h1',expectedVersion:4,surface:'PROPERTY'}));
  it('rejects submission without an assignee',()=>expect(()=>housekeepingAssignmentCommand({id:'task-a',version:1},'','PROPERTY')).toThrow('Select a housekeeper'));
  it('refreshes authoritative state after successful assignment',async()=>{const command=vi.fn(async()=>({})),refresh=vi.fn(async()=>undefined),notify=vi.fn();expect(await submitHousekeepingAssignment({task:{id:'task-a',version:1,roomNumber:'102'},assigneeId:'h1',surface:'PROPERTY',command,refresh,notify})).toBe(true);expect(refresh).toHaveBeenCalledOnce();expect(notify).toHaveBeenCalledWith('Room 102 assignment saved.');});
  it('reports an API failure without refreshing',async()=>{const command=vi.fn(async()=>{throw new Error('Stale task');}),refresh=vi.fn(async()=>undefined),notify=vi.fn();expect(await submitHousekeepingAssignment({task:{id:'task-a',version:1},assigneeId:'h1',surface:'PROPERTY',command,refresh,notify})).toBe(false);expect(refresh).not.toHaveBeenCalled();expect(notify).toHaveBeenCalledWith('Stale task');});
});
