import { describe, expect, it } from 'vitest';
import { roleCan, type AppRole } from '@/lib/domain';
import { guestInputSchema, guestListSchema, identityDocumentSchema, maskedIdentityNumber } from '@/lib/server/guests/validation';
import { assignRoomSchema, checkInSchema, frontDeskListSchema, keyIssueSchema, lateCheckoutSchema, roomMoveSchema } from './validation';

describe('Step 3 validation and permission boundaries',()=>{
 it.each([
  ['OWNER','guest.view',true],['MANAGER','guest.edit',true],['RECEPTION','guest.create',true],['RECEPTION','guest.kyc.view',true],['RECEPTION','guest.kyc.verify',true],
  ['HOUSEKEEPING','guest.kyc.view',false],['RESTAURANT','guest.kyc.view',false],['REPORTING','guest.kyc.view',false],['REPORTING','frontdesk.view',true],
  ['RECEPTION','frontdesk.assign_room',true],['RECEPTION','frontdesk.checkin',true],['RECEPTION','frontdesk.room_move',true],['RECEPTION','frontdesk.override',false],
  ['MANAGER','frontdesk.override',true],['OWNER','frontdesk.late_checkout',true],['ACCOUNTS','frontdesk.checkin',false],
 ] as const)('%s / %s => %s',(role,permission,allowed)=>expect(roleCan(role as AppRole,permission)).toBe(allowed));
 it('accepts a complete guest profile',()=>expect(guestInputSchema.parse({firstName:'Asha',lastName:'Rao',phone:'9876543210',email:'asha@example.com',dateOfBirth:'1990-01-01',nationality:'Indian',gstin:'27ABCDE1234F1Z5'}).firstName).toBe('Asha'));
 it('rejects incomplete guest details',()=>expect(()=>guestInputSchema.parse({firstName:'',phone:''})).toThrow());
 it('supports server pagination',()=>expect(guestListSchema.parse({page:'2',pageSize:'10'})).toMatchObject({page:2,pageSize:10}));
 it('masks Aadhaar',()=>expect(maskedIdentityNumber('AADHAAR','1234')).toBe('XXXX XXXX 1234'));
 it('masks another ID',()=>expect(maskedIdentityNumber('PASSPORT','a123')).toBe('••••A123'));
 it('rejects full identity numbers',()=>expect(()=>identityDocumentSchema.parse({documentType:'AADHAAR',last4:'123412341234'})).toThrow());
 it.each(['AADHAAR','PASSPORT','DRIVING_LICENCE','VOTER_ID','OTHER'] as const)('accepts %s metadata',documentType=>expect(identityDocumentSchema.parse({documentType,last4:'1A2B'}).documentType).toBe(documentType));
 it('validates assigned room',()=>expect(assignRoomSchema.parse({roomId:'00000000-0000-4000-8000-000000000001'}).roomId).toContain('0000'));
 it('rejects invalid room assignment',()=>expect(()=>assignRoomSchema.parse({roomId:'other-property'})).toThrow());
 it('defaults standard check-in flags',()=>expect(checkInSchema.parse({})).toMatchObject({overrideDirty:false,earlyCheckInOverride:false,keys:[]}));
 it('accepts tracked access cards',()=>expect(checkInSchema.parse({keys:[{keyType:'CARD',keyLabel:'CARD-10',quantity:2}]}).keys).toHaveLength(1));
 it('requires room move reason',()=>expect(()=>roomMoveSchema.parse({roomId:'00000000-0000-4000-8000-000000000001',reason:''})).toThrow());
 it('accepts room move with reason',()=>expect(roomMoveSchema.parse({roomId:'00000000-0000-4000-8000-000000000001',reason:'Guest requested quieter room'}).reason).toContain('quieter'));
 it('validates late checkout request',()=>expect(lateCheckoutSchema.parse({action:'REQUEST',requestedUntil:'2026-09-09T14:00:00Z'}).action).toBe('REQUEST'));
 it('requires late checkout decision note',()=>expect(()=>lateCheckoutSchema.parse({action:'APPROVE',note:''})).toThrow());
 it('validates key issue quantity',()=>expect(keyIssueSchema.parse({keyType:'PHYSICAL',keyLabel:'K-12',quantity:1}).quantity).toBe(1));
 it('rejects excessive keys',()=>expect(()=>keyIssueSchema.parse({keyLabel:'K',quantity:11})).toThrow());
 it.each(['arrivals','expected','checked-in','in-house','departures','no-shows'] as const)('accepts %s front desk list',view=>expect(frontDeskListSchema.parse({view}).view).toBe(view));
});
