import {z} from 'zod';
import {and,eq} from 'drizzle-orm';
import {assertRoleCan,DomainError} from '@hotel/shared/domain';
import {getDb} from '@/db';
import {travelPackages,travelAssets,auditLogs} from '@/db/schema';
import type {TravelContext} from './context';
const name=z.string().trim().min(2).max(200);
const catalogSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('CREATE_TRAVEL_PRODUCT'),name,durationDays:z.number().int().min(1).max(365),locations:name,capacity:z.number().int().min(1).max(1000),sellingPriceRupees:z.number().multipleOf(0.01).positive().max(1000000)}),
 z.object({action:z.literal('SAVE_TRAVEL_ASSET'),id:z.string().optional(),expectedUpdatedAt:z.string().optional(),name,category:z.enum(['HOTEL','TRANSPORT','ACTIVITY','MEAL','GUIDE','OTHER']),description:name,pricingUnit:z.enum(['PER_PERSON','PER_NIGHT','PER_DAY','PER_TRIP']),unitPriceRupees:z.number().multipleOf(0.01).nonnegative().max(1000000),active:z.boolean()}),
]);
export async function saveTravelCatalog(c:TravelContext,raw:unknown){
 assertRoleCan(c.actor.role,'travel.pricing.manage');
 const input=catalogSchema.parse(raw),id=('id'in input?input.id:undefined)??crypto.randomUUID(),now=new Date().toISOString();
 return getDb().transaction(async tx=>{
  if(input.action==='CREATE_TRAVEL_PRODUCT'){
   const {action:_,...fields}=input;void _;
   await tx.insert(travelPackages).values({...fields,id,organisationId:c.organisation.id,booked:0,status:'ACTIVE'});
  }else{
   const fields={name:input.name,category:input.category,description:input.description,pricingUnit:input.pricingUnit,unitPriceRupees:input.unitPriceRupees,active:input.active,updatedAt:now};
   if(input.id){const changed=await tx.update(travelAssets).set(fields).where(and(eq(travelAssets.id,input.id),eq(travelAssets.organisationId,c.organisation.id),eq(travelAssets.updatedAt,input.expectedUpdatedAt??''))).returning({id:travelAssets.id});if(!changed.length)throw new DomainError('STALE_ASSET','This asset changed. Refresh and retry.',409);}
   else await tx.insert(travelAssets).values({...fields,id,organisationId:c.organisation.id});
  }
  await tx.insert(auditLogs).values({id:crypto.randomUUID(),timestamp:now,actorId:c.actor.id,actorName:c.actor.name,role:c.actor.role,propertyId:null,action:input.action,entity:'TRAVEL_CATALOG',entityId:id,newValue:JSON.stringify({organisationId:c.organisation.id,name:input.name}),source:'PRODUCTION_TRAVEL_API',correlationId:crypto.randomUUID()});return {id};
 });
}
