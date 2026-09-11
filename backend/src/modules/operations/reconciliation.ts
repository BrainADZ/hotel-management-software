import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertRoleCan, DomainError, roleCan } from '@hotel/shared/domain';
import { getDb } from '@/db';
import { auditLogs, folios, offlineBills, reservations } from '@/db/schema';
import type { ReservationContext } from '@/services/reservations/types';

const referenceSchema = z.object({
  id: z.string().min(1).max(120), offlineReference:z.string().min(1).max(120),
  bookingReference:z.string().min(1).max(120), deviceId:z.string().min(1).max(120),
  localAmountPaise:z.number().int().nonnegative().max(2_000_000_000),
  taxPaise:z.number().int().nonnegative().max(2_000_000_000),
  documentHash:z.string().regex(/^[a-f0-9]{64}$/), generatedAt:z.iso.datetime(),
});

/** Reconcile references only. Never turn client totals into payments or folio charges. */
export async function reconcileReference(c:ReservationContext,raw:Record<string,unknown>) {
  const registering=raw.action==='REGISTER_OFFLINE_BILL';
  if(registering){if(!roleCan(c.actor.role,'offline.bill.create')&&!roleCan(c.actor.role,'offline.bill.verify'))throw new DomainError('FORBIDDEN','Your role cannot register offline bills.',403);}
  else assertRoleCan(c.actor.role,'offline.bill.verify');
  const input=registering?referenceSchema.parse(raw):null;
  const id=input?.id??z.string().min(1).max(120).parse(raw.offlineBillId);
  return getDb().transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`offline-bill:${id}`}))`);
    const [existing]=await tx.select().from(offlineBills).where(eq(offlineBills.id,id));
    if(existing&&existing.propertyId!==c.property.id)throw new DomainError('NOT_FOUND','Bill reference not found.',404);
    if(!existing&&!input)throw new DomainError('NOT_FOUND','Register the bill reference first.',404);
    if(existing&&input&&(existing.documentHash!==input.documentHash||existing.localAmountPaise!==input.localAmountPaise||existing.bookingReference!==input.bookingReference||existing.offlineReference!==input.offlineReference))throw new DomainError('BILL_REFERENCE_CONFLICT','This bill reference already contains different data.',409);
    const [reservation]=await tx.select().from(reservations).where(and(eq(reservations.propertyId,c.property.id),eq(reservations.organisationId,c.actor.organisationId),eq(reservations.reference,input?.bookingReference??existing!.bookingReference)));
    if(!reservation)throw new DomainError('MASTER_RECORD_NOT_FOUND','Sync or create the reservation, then use its Master Hub booking reference.',409);
    const [key]=await tx.select({id:folios.id}).from(folios).where(and(eq(folios.reservationId,reservation.id),eq(folios.propertyId,c.property.id)));
    if(!key)throw new DomainError('MASTER_RECORD_NOT_FOUND','Create the guest folio before reconciliation.',409);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`folio:${key.id}`}))`);
    const [folio]=await tx.select().from(folios).where(eq(folios.id,key.id)).for('update');
    const matches=folio.totalPaise===(input?.localAmountPaise??existing!.localAmountPaise)&&folio.taxPaise===(input?.taxPaise??existing!.taxPaise);
    if(!registering&&!matches)throw new DomainError('AMOUNT_MISMATCH','Folio total or tax differs. Review Folios & Billing before verifying.',409);
    const status=registering?(existing?.status==='VERIFIED'&&matches?'VERIFIED':matches?'MATCHED':'AMOUNT_MISMATCH'):'VERIFIED';
    const now=new Date().toISOString();
    if(!existing&&input)await tx.insert(offlineBills).values({...input,propertyId:c.property.id,reservationId:reservation.id,guestId:reservation.guestId,generatedBy:c.actor.name,cloudAmountPaise:folio.totalPaise,status,notes:'Reference reconciliation. Original PDF is retained on the originating device.'});
    else await tx.update(offlineBills).set({status,cloudAmountPaise:folio.totalPaise,...(!registering?{verifiedAt:now,verifiedBy:c.actor.id}:{})}).where(and(eq(offlineBills.id,id),eq(offlineBills.propertyId,c.property.id)));
    await tx.insert(auditLogs).values({id:crypto.randomUUID(),timestamp:now,actorId:c.actor.id,actorName:c.actor.name,role:c.actor.role,propertyId:c.property.id,action:registering?'OFFLINE_REFERENCE_REGISTERED':'OFFLINE_REFERENCE_VERIFIED',entity:'OFFLINE_BILL',entityId:id,newValue:JSON.stringify({status,financialReplay:false,documentStored:false}),source:'PRODUCTION_API',correlationId:crypto.randomUUID()});
    return {id,status,cloudAmountPaise:folio.totalPaise,financialReplay:false};
  });
}
