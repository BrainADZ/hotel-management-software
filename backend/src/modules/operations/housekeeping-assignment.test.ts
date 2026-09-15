import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roleCan, type AppRole } from '@hotel/shared/domain';
import { assertEligibleHousekeeper, assertHousekeepingAssignmentActor, assertHousekeepingTaskAssignable } from './housekeeping-assignment';

const user = { id: 'staff-a', organisationId: 'org-a', propertyId: 'property-a', role: 'HOUSEKEEPING', active: true };
describe('housekeeping assignment authorization', () => {
  it.each([['OWNER',true],['MANAGER',true],['RECEPTION',true],['HOUSEKEEPING',false],['RESTAURANT',false],['ACCOUNTS',false]] as const)('%s assignment permission is %s',(role,expected)=>expect(roleCan(role as AppRole,'housekeeping.assign')).toBe(expected));
  it.each(['OWNER','MANAGER','RECEPTION'] as const)('accepts authorized %s', role => expect(() => assertHousekeepingAssignmentActor(role)).not.toThrow());
  it.each(['HOUSEKEEPING','RESTAURANT','ACCOUNTS'] as const)('rejects unauthorized %s', role => expect(() => assertHousekeepingAssignmentActor(role)).toThrow());
});
describe('housekeeping assignee eligibility', () => {
  it('accepts an active property housekeeping employee',()=>expect(()=>assertEligibleHousekeeper(user,'org-a','property-a')).not.toThrow());
  it('rejects a missing employee',()=>expect(()=>assertEligibleHousekeeper(undefined,'org-a','property-a')).toThrow());
  it('rejects a disabled employee',()=>expect(()=>assertEligibleHousekeeper({...user,active:false},'org-a','property-a')).toThrow());
  it('rejects a foreign organisation',()=>expect(()=>assertEligibleHousekeeper({...user,organisationId:'org-b'},'org-a','property-a')).toThrow());
  it('rejects a foreign property',()=>expect(()=>assertEligibleHousekeeper({...user,propertyId:'property-b'},'org-a','property-a')).toThrow());
  it('rejects an employee without property access',()=>expect(()=>assertEligibleHousekeeper({...user,propertyId:null},'org-a','property-a')).toThrow());
  it.each(['MANAGER','RECEPTION','RESTAURANT'])('rejects %s as assignee',role=>expect(()=>assertEligibleHousekeeper({...user,role},'org-a','property-a')).toThrow());
});
describe('housekeeping task assignment conflicts',()=>{
  it.each(['UNASSIGNED','ASSIGNED','PENDING','DEFERRED'])('allows active status %s',status=>expect(()=>assertHousekeepingTaskAssignable({status,version:2},2)).not.toThrow());
  it.each(['COMPLETED','CANCELLED'])('rejects terminal status %s',status=>expect(()=>assertHousekeepingTaskAssignable({status,version:2},2)).toThrow(/cannot be assigned/));
  it('rejects a stale expected version',()=>expect(()=>assertHousekeepingTaskAssignable({status:'ASSIGNED',version:3},2)).toThrow(/updated/));
  it('migration adds an assignee FK and checkout-cleaning uniqueness',()=>{const sql=readFileSync('drizzle-postgres/0008_housekeeping_assignment.sql','utf8');expect(sql).toContain('assigned_user_id');expect(sql).toContain('REFERENCES "public"."app_users"');expect(sql).toContain('idx_housekeeping_unique_checkout_cleaning');});
  it.each(['src/services/front-desk/service.ts','src/modules/operations/service.ts'])('%s creates an unassigned checkout cleaning task',file=>{const source=readFileSync(file,'utf8');expect(source).toMatch(/taskType:\s*'CHECKOUT_CLEANING'/);expect(source).toMatch(/status:\s*'UNASSIGNED'/);expect(source).toContain('onConflictDoNothing()');});
  it('financial checkout requests inspection before final closure',()=>{const source=readFileSync('src/modules/billing/service.ts','utf8');expect(source).toMatch(/taskType:\s*'CHECKOUT_INSPECTION'/);expect(source).toMatch(/status:\s*'NEEDS_INSPECTION'/);expect(source).toContain('CHECKOUT_INSPECTION_PENDING');});
  it('cleaning completion keeps the authoritative room transition',()=>{const source=readFileSync('src/modules/operations/service.ts','utf8');expect(source).toContain("if (outcome === 'DONE')");expect(source).toContain("operationalStatus: 'CLEAN'");});
  it('housekeeping queue is scoped by authenticated assignee',()=>{const source=readFileSync('src/api/operations/route.ts','utf8');expect(source).toMatch(/c\.actor\.role\s*===\s*'HOUSEKEEPING'/);expect(source).toMatch(/eq\(\s*housekeepingTasks\.assignedUserId,\s*c\.actor\.id,?\s*\)/);});
});
