import {and,eq,desc} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from '@/db';
import {tours,participants,communicationDrafts} from '@/db/operational-schema';
import {travelPackages,appUsers,inquiries,auditLogs} from '@/db/schema';
import {assertRoleCan,DomainError,roleCan} from '@hotel/shared/domain';
import type {TravelContext} from './context';
const id=z.string().min(1).max(120),name=z.string().trim().min(2).max(200);
export const travelWorkflowSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('SAVE_TOUR'),id:id.optional(),expectedVersion:z.number().int().positive().optional(),packageId:id,name,departureDate:z.iso.date(),capacity:z.number().int().positive().max(1000),managerId:id.optional(),status:z.enum(['SELLING','CONFIRMED','COMPLETED','CANCELLED'])}),
 z.object({action:z.literal('ADD_PARTICIPANT'),tourId:id,name,sharing:z.enum(['SINGLE','DOUBLE','TRIPLE']),notes:z.string().max(1000).default('')}),
 z.object({action:z.literal('SAVE_COMMUNICATION_DRAFT'),inquiryId:id,channel:z.enum(['EMAIL','WHATSAPP']),recipient:z.string().trim().min(3).max(320),subject:name,body:z.string().trim().min(1).max(5000)}),
]);
export async function travelWorkflowSnapshot(c:TravelContext){const db=getDb();const [tourRows,participantRows,managers,drafts,audit]=await Promise.all([
 db.select().from(tours).where(eq(tours.organisationId,c.organisation.id)).orderBy(desc(tours.departureDate)).limit(500),
 db.select().from(participants).where(eq(participants.organisationId,c.organisation.id)).limit(2000),
 db.select({id:appUsers.id,name:appUsers.name,role:appUsers.role}).from(appUsers).where(and(eq(appUsers.organisationId,c.organisation.id),eq(appUsers.role,'TOUR_MANAGER'),eq(appUsers.active,true))),
 db.select().from(communicationDrafts).where(eq(communicationDrafts.organisationId,c.organisation.id)).orderBy(desc(communicationDrafts.createdAt)).limit(500),
 roleCan(c.actor.role,'reports.read')?db.select({event:auditLogs}).from(auditLogs).innerJoin(appUsers,eq(appUsers.id,auditLogs.actorId)).where(and(eq(appUsers.organisationId,c.organisation.id),eq(auditLogs.source,'PRODUCTION_TRAVEL_API'))).orderBy(desc(auditLogs.timestamp)).limit(250).then(rows=>rows.map(r=>r.event)):[],
]);return {audit,tours:tourRows,participants:participantRows,tourManagers:managers,communicationDrafts:drafts};}
export async function mutateTravelWorkflow(c:TravelContext,raw:unknown){assertRoleCan(c.actor.role,'travel.package.create');const p=travelWorkflowSchema.parse(raw);return getDb().transaction(async tx=>{
 const now=new Date().toISOString(),recordId=('id'in p?p.id:undefined)??crypto.randomUUID();
 if(p.action==='SAVE_TOUR'){
  const [pkg]=await tx.select().from(travelPackages).where(and(eq(travelPackages.id,p.packageId),eq(travelPackages.organisationId,c.organisation.id)));if(!pkg)throw new DomainError('NOT_FOUND','Package not found.',404);
  if(p.managerId){const [manager]=await tx.select().from(appUsers).where(and(eq(appUsers.id,p.managerId),eq(appUsers.organisationId,c.organisation.id),eq(appUsers.role,'TOUR_MANAGER'),eq(appUsers.active,true)));if(!manager)throw new DomainError('INVALID_MANAGER','Choose an active tour manager.',400);}
  const fields={packageId:p.packageId,name:p.name,departureDate:p.departureDate,capacity:p.capacity,managerId:p.managerId??null,status:p.status,updatedAt:now};
  if(p.id){const [existing]=await tx.select().from(tours).where(and(eq(tours.id,p.id),eq(tours.organisationId,c.organisation.id))).for('update');if(!existing||existing.version!==p.expectedVersion)throw new DomainError('STALE_TOUR','Tour changed. Refresh and retry.',409);const roster=await tx.select().from(participants).where(eq(participants.tourId,p.id));if(p.capacity<roster.length)throw new DomainError('CAPACITY_EXCEEDED','Capacity cannot be below the registered traveller count.',409);await tx.update(tours).set({...fields,version:existing.version+1}).where(eq(tours.id,p.id));}else await tx.insert(tours).values({...fields,id:recordId,organisationId:c.organisation.id});
 }else if(p.action==='ADD_PARTICIPANT'){
  const [tour]=await tx.select().from(tours).where(and(eq(tours.id,p.tourId),eq(tours.organisationId,c.organisation.id))).for('update');if(!tour||!['SELLING','CONFIRMED'].includes(tour.status))throw new DomainError('TOUR_NOT_OPEN','Choose an open tour.',409);const roster=await tx.select().from(participants).where(eq(participants.tourId,tour.id));if(roster.length>=tour.capacity)throw new DomainError('CAPACITY_EXCEEDED','This tour is full.',409);await tx.insert(participants).values({id:recordId,organisationId:c.organisation.id,tourId:p.tourId,name:p.name,sharing:p.sharing,notes:p.notes,createdAt:now});
 }else{
  const [inquiry]=await tx.select().from(inquiries).where(and(eq(inquiries.id,p.inquiryId),eq(inquiries.organisationId,c.organisation.id)));if(!inquiry)throw new DomainError('NOT_FOUND','Inquiry not found.',404);await tx.insert(communicationDrafts).values({id:recordId,organisationId:c.organisation.id,inquiryId:p.inquiryId,channel:p.channel,recipient:p.recipient,subject:p.subject,body:p.body,createdAt:now});
 }
 await tx.insert(auditLogs).values({id:crypto.randomUUID(),timestamp:now,actorId:c.actor.id,actorName:c.actor.name,role:c.actor.role,propertyId:null,action:p.action,entity:'TRAVEL_WORKFLOW',entityId:recordId,newValue:JSON.stringify({organisationId:c.organisation.id}),source:'PRODUCTION_TRAVEL_API',correlationId:crypto.randomUUID()});return {id:recordId};
});}
