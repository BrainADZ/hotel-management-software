import {expect,it,vi} from 'vitest';
import type {ReservationContext} from '@/services/reservations/types';
const mocks=vi.hoisted(()=>({legacy:vi.fn(),db:vi.fn()}));
vi.mock('./workflows',()=>({isWorkflowAction:(action:string)=>['CREATE_MAINTENANCE','RESOLVE_MAINTENANCE'].includes(action),mutateWorkflow:mocks.legacy}));
vi.mock('@/db',()=>({getDb:mocks.db}));
import {mutateOperations} from './service';
const context:ReservationContext={actor:{id:'owner',name:'Owner',email:'test@example.test',role:'OWNER',organisationId:'org',propertyId:'property'},property:{id:'property',organisationId:'org',name:'Test',code:'TEST',timezone:'Asia/Kolkata'}};
it('uses the maintenance-specific category validation instead of the old generic workflow',async()=>{
 await expect(mutateOperations(context,{action:'CREATE_MAINTENANCE',issue:'Test issue',category:'INVALID'})).rejects.toMatchObject({code:'INVALID_MAINTENANCE_CATEGORY'});
 expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.db).not.toHaveBeenCalled();
});
it.each(['RECEPTION','HOUSEKEEPING','RESTAURANT','ACCOUNTS'] as const)('rejects maintenance writes from %s before data access',async role=>{
 await expect(mutateOperations({...context,actor:{...context.actor,role}},{action:'RESOLVE_MAINTENANCE',ticketId:'ticket',expectedVersion:1,resolutionNote:'Fixed'})).rejects.toMatchObject({status:403});
 expect(mocks.legacy).not.toHaveBeenCalled();expect(mocks.db).not.toHaveBeenCalled();
});
